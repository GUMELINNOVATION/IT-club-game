import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database as db } from "../database.js";
import { requireAdmin, writeAuditLog } from "../auth.js";
import { caseSchema } from "./cases.js";
import { competitionSchema, configSchema, configuration } from "./model.js";
import { createDetective, progressSchema, reportSchema, startSchema } from "./service.js";
import { DetectiveError } from "./engine.js";

declare module "express-session" { interface SessionData { detectiveOwner?: string } }
export function detectiveRouter(publish: () => void) {
  const router = Router(), service = createDetective(db, publish);
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));
  router.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      const site = req.get("sec-fetch-site"), origin = req.get("origin");
      let validOrigin = !origin;
      try { validOrigin ||= Boolean(origin && new URL(origin).host === req.get("host")); } catch { /* Reject malformed origins. */ }
      // Browser-controlled Fetch Metadata remains accurate through the Vite proxy,
      // whose upstream Host can differ from the public origin.
      if (site === "cross-site" || (site !== "same-origin" && !validOrigin)) { res.status(403).json({ error: "Cross-site request rejected." }); return; }
    }
    next();
  });
  const owner = (req: Request) => req.session.detectiveOwner ??= randomUUID();
  router.get("/catalog", (_req, res) => res.json(service.catalog()));
  router.get("/leaderboard", (req, res) => res.json(service.leaderboard(typeof req.query.board === "string" ? req.query.board : undefined)));
  router.get("/recover", (req, res) => res.json(service.recover(owner(req))));
  router.post("/attempts", rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false }), (req, res) => {
    const input = startSchema.parse(req.body);
    if (req.session.arenaParticipantId && req.session.arenaParticipantId !== input.participantId) throw new DetectiveError(409, "Finish the previous participant session before changing identity.");
    req.session.arenaParticipantId = input.participantId;
    res.status(201).json(service.start(input, owner(req)));
  });
  router.get("/attempts/:id", (req, res) => res.json(service.view(String(req.params.id), owner(req))));
  router.post("/attempts/:id/begin", (req, res) => res.json(service.begin(String(req.params.id), owner(req))));
  router.put("/attempts/:id/progress", (req, res) => { const input = z.object({ revision: z.number().int().nonnegative(), progress: progressSchema }).strict().parse(req.body); res.json(service.save(String(req.params.id), owner(req), input.progress, input.revision)); });
  router.post("/attempts/:id/hint", (req, res) => res.json(service.hint(String(req.params.id), owner(req))));
  router.post("/attempts/:id/submit", (req, res) => res.json(service.submit(String(req.params.id), owner(req), reportSchema.parse(req.body))));
  router.post("/reset", (req, res, next) => { service.reset(owner(req)); req.session.destroy(error => { if (error) { next(error); return; } res.clearCookie("connect.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" }); res.status(204).end(); }); });
  router.use("/admin", requireAdmin);
  const manage = (req: Request, res: Response, next: NextFunction) => { if (!["super_admin", "event_manager"].includes(req.session.adminRole ?? "")) { res.status(403).json({ error: "Event manager access required." }); return; } next(); };
  router.get("/admin/overview", (_req, res) => res.json({ config: configuration(db).content, analytics: service.analytics(), competitions: (db.prepare("SELECT id,content FROM competitions WHERE game='digital-detective'").all() as { id: string; content: string }[]).map(r => ({ id: r.id, ...JSON.parse(r.content) })) }));
  router.get("/admin/attempts", (req, res) => { if (req.session.adminRole === "display_operator") { res.status(403).json({ error: "Roster and reports restricted to operational staff." }); return; } res.json(service.attempts()); });
  router.get("/admin/cases", manage, (_req, res) => res.json(service.adminCases()));
  router.put("/admin/config", manage, (req, res) => { const config = configSchema.parse(req.body); db.prepare("INSERT INTO dd_config(content,created_at) VALUES (?,?)").run(JSON.stringify(config), Date.now()); writeAuditLog(req.session.adminId!, "detective.config.update"); publish(); res.json(config); });
  router.put("/admin/cases/:id", manage, (req, res) => { const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(req.params.id); const input = z.object({ content: caseSchema, status: z.enum(["draft", "published", "archived"]) }).parse(req.body); const result = service.saveCase(id, input.content, input.status); writeAuditLog(req.session.adminId!, "detective.case.version", result); res.json(result); });
  router.put("/admin/competitions/:id", manage, (req, res) => {
    const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(req.params.id), input = competitionSchema.parse(req.body);
    service.version(input.caseId, input.version);
    const previous = db.prepare("SELECT content FROM competitions WHERE id=? AND game='digital-detective'").get(id) as { content: string } | undefined;
    const prior = previous ? JSON.parse(previous.content) : null;
    if (prior?.status !== "draft" && prior) {
      const { status: _oldStatus, ...oldSettings } = prior; delete oldSettings.config;
      const { status: _newStatus, ...newSettings } = input;
      if (JSON.stringify(oldSettings) !== JSON.stringify(newSettings) || (prior.status === "closed" && input.status !== "closed")) throw new DetectiveError(409, "Opened competitions are immutable; only closing is permitted. Duplicate for a new competition.");
    }
    const content = { ...input, ...(input.status === "open" || prior?.config ? { config: prior?.config ?? configuration(db).content } : {}) };
    db.prepare("INSERT INTO competitions VALUES (?,'digital-detective',?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,content=excluded.content").run(id, input.title, input.status, JSON.stringify(content), Date.now());
    writeAuditLog(req.session.adminId!, "detective.competition.update", { id, status: input.status }); publish(); res.json({ id });
  });
  router.post("/admin/attempts/:id/adjust", manage, (req, res) => { const input = z.object({ score: z.number().int().min(0).max(1200), reason: z.string().trim().min(10).max(1000) }).parse(req.body); service.adjust(String(req.params.id), input.score, input.reason, req.session.adminId!); res.json({ saved: true }); });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => { if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues.map(i => i.message).join(" ") }); return; } if (error instanceof DetectiveError) { res.status(error.status).json({ error: error.message }); return; } next(error); });
  return router;
}
