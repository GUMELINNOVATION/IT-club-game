import express from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { database as db } from "../database.js";
import { requireAdmin, writeAuditLog } from "../auth.js";
import { categories } from "./seed.js";
import { allQuestions, configSchema, currentConfiguration, normalizeStatement, questionSchema, type Question, type QuestionInput } from "./model.js";
import { GameError, selectQuestions } from "./engine.js";
import { createMythService, hash, startSchema, type Challenge } from "./service.js";
import { csv, parseCsv } from "./csv.js";

declare module "express-session" {
  interface SessionData { mythOwner?: string; arenaParticipantId?: string }
}

export function mythRouter(publish: () => void) {
  const router = express.Router();
  const game = createMythService(db, publish);
  router.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use((req, res, next) => {
    const header = req.headers.origin;
    if (req.method !== "GET" && header) {
      const loopback = (value: string) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(value);
      const hosts = [req.headers.host ?? "", ...String(req.headers["x-forwarded-host"] ?? "").split(",")].map((value) => value.trim()).filter((value) => value.length > 0);
      let origin: URL | null = null;
      try { origin = new URL(header); } catch { /* Invalid origins are rejected below. */ }
      const hostnames = hosts.flatMap((value) => { try { return [new URL(`http://${value}`).hostname]; } catch { return []; } });
      // The Vite development proxy forwards requests to a different port, so allow loopback-to-loopback
      // during development. Production and public hosts must match Host or X-Forwarded-Host exactly.
      const localDevelopment = process.env.NODE_ENV !== "production" && Boolean(origin && loopback(origin.hostname) && hostnames.some(loopback));
      if (!origin || (!hosts.includes(origin.host) && !localDevelopment)) {
        res.status(403).json({ error: "Same-origin requests are required." }); return;
      }
    }
    next();
  });
  const owner = (req: express.Request) => {
    if (!req.session.mythOwner) throw new GameError(401, "Start or resume using this device's session.");
    return req.session.mythOwner;
  };
  router.get("/meta", (_req, res) => {
    const config = currentConfiguration(db);
    const counts = allQuestions(db).filter((q) => q.active && q.reviewStatus === "reviewed");
    const challenges = (db.prepare("SELECT * FROM mf_challenges WHERE published = 1").all() as Challenge[]).map((c) => ({
      id: c.id, title: c.title, version: c.version, registrationOpen: Boolean(c.registration_open), participation: c.participation,
      questionCount: JSON.parse(c.question_refs).length, revealAfterClose: Boolean(c.reveal_after_close)
    }));
    res.json({ config: config.config, configId: config.id, categories, questionCount: counts.length, challenges });
  });
  router.get("/leaderboard", (req, res) => {
    const query = z.object({ mode: z.string().max(30).optional(), participation: z.enum(["solo", "team"]).optional(), boardKey: z.string().max(250).optional(), challengeId: z.string().max(80).optional() }).parse(req.query);
    res.json(game.leaderboard(query));
  });
  router.get("/pending", (req, res) => res.json({ attempt: req.session.mythOwner ? game.pending(owner(req)) : null }));
  router.post("/start", rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false }), (req, res, next) => {
    const input = startSchema.parse(req.body);
    if (req.session.arenaParticipantId && req.session.arenaParticipantId !== input.participantId) throw new GameError(409, "Finish the previous participant session before registering a new participant.");
    req.session.arenaParticipantId = input.participantId;
    req.session.mythOwner ??= randomUUID();
    // Save the ownership cookie before creating a run so it survives network retries.
    req.session.save((error) => {
      if (error) { next(error); return; }
      try { res.status(201).json(game.start(input, owner(req))); } catch (cause) { next(cause); }
    });
  });
  router.get("/attempts/:id", (req, res) => res.json(game.state(req.params.id, owner(req))));
  router.post("/attempts/:id/answer", (req, res) => {
    const input = z.object({ ordinal: z.number().int().nonnegative(), answer: z.boolean().nullable(), confidence: z.number().int().min(0).max(2).nullable() }).strict().parse(req.body);
    res.json(game.answer(req.params.id, owner(req), input.ordinal, input.answer, input.confidence));
  });
  router.post("/attempts/:id/next", (req, res) => res.json(game.next(req.params.id, owner(req))));
  router.post("/attempts/:id/hint", (req, res) => res.json(game.hint(req.params.id, owner(req))));
  router.post("/reset", (req, res) => {
    if (req.session.mythOwner) {
      const pending = game.pending(owner(req));
      if (pending) game.abandon(pending.id, owner(req));
    }
    delete req.session.mythOwner;
    delete req.session.arenaParticipantId;
    req.session.save((error) => error ? res.status(500).json({ error: "Session reset failed. Retry before the next participant." }) : res.status(204).end());
  });

  router.use("/admin", requireAdmin);
  const edit: express.RequestHandler = (req, _res, next) => {
    if (!["super_admin", "event_manager"].includes(req.session.adminRole ?? "")) throw new GameError(403, "An event manager or super administrator is required.");
    next();
  };
  router.get("/admin/results", (req, res) => {
    const filter = z.object({ challengeId: z.string().optional(), boardKey: z.string().optional() }).parse(req.query);
    const result = game.leaderboard(filter);
    res.json(result);
  });
  router.get("/admin/rankings.csv", (req, res) => {
    const result = game.leaderboard({ challengeId: typeof req.query.challengeId === "string" ? req.query.challengeId : undefined });
    res.type("text/csv").attachment("myth-fact-rankings.csv").send(csv(result.entries, ["boardKey", "rank", "challenger", "score", "accuracy", "correct", "longestStreak", "completionMs", "mode", "participation", "challengeVersion"]));
  });
  router.get("/admin/challenges", (_req, res) => {
    res.json((db.prepare("SELECT * FROM mf_challenges ORDER BY created_at DESC").all() as Challenge[]).map((row) => ({ ...row, question_refs: JSON.parse(row.question_refs), config: JSON.parse(row.config) })));
  });
  router.post("/admin/challenges/:id/codes", (req, res) => {
    if (!["super_admin", "event_manager", "volunteer"].includes(req.session.adminRole ?? "")) throw new GameError(403, "A volunteer or event manager is required.");
    const input = z.object({ count: z.number().int().min(1).max(100), label: z.string().trim().min(1).max(80) }).parse(req.body);
    const challenge = db.prepare("SELECT * FROM mf_challenges WHERE id = ?").get(req.params.id) as Challenge | undefined;
    if (!challenge?.published || !challenge.registration_open) throw new GameError(409, "Open a published challenge before issuing codes.");
    const codes = db.transaction(() => Array.from({ length: input.count }, () => {
      const code = randomBytes(8).toString("hex").toUpperCase();
      db.prepare("INSERT INTO mf_entry_codes(id, challenge_id, code_hash, label, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), challenge.id, hash(code), input.label, Date.now());
      return code;
    }))();
    writeAuditLog(req.session.adminId!, "myth.codes.issue", { challengeId: challenge.id, count: codes.length, label: input.label });
    res.json({ codes });
  });
  router.use("/admin", edit);
  router.get("/admin/config", (_req, res) => res.json(currentConfiguration(db)));
  router.put("/admin/config", (req, res) => {
    const config = configSchema.parse(req.body);
    const result = db.prepare("INSERT INTO mf_configurations(config, created_at) VALUES (?, ?)").run(JSON.stringify(config), Date.now());
    writeAuditLog(req.session.adminId!, "myth.config.version", { configId: Number(result.lastInsertRowid) });
    publish(); res.json(currentConfiguration(db));
  });
  router.get("/admin/questions", (req, res) => {
    const query = z.object({ search: z.string().optional(), category: z.string().optional(), difficulty: z.string().optional(), reviewStatus: z.string().optional(), active: z.string().optional(), sort: z.enum(["statement", "difficulty", "category", "reviewedAt"]).optional() }).parse(req.query);
    let list = allQuestions(db);
    if (query.search) list = list.filter((q) => `${q.statement} ${q.explanation} ${q.id}`.toLowerCase().includes(query.search!.toLowerCase()));
    if (query.category) list = list.filter((q) => q.category === query.category);
    if (query.difficulty) list = list.filter((q) => q.difficulty === Number(query.difficulty));
    if (query.reviewStatus) list = list.filter((q) => q.reviewStatus === query.reviewStatus);
    if (query.active) list = list.filter((q) => q.active === (query.active === "true"));
    const sort = query.sort ?? "statement";
    list.sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }));
    res.json({ questions: list, total: allQuestions(db).length });
  });
  const saveQuestion = (raw: QuestionInput, forcedId?: string): Question => {
    const id = forcedId ?? raw.id ?? randomUUID();
    const existing = db.prepare("SELECT current_version FROM mf_questions WHERE id = ?").get(id) as { current_version: number } | undefined;
    const normalized = normalizeStatement(raw.statement);
    const duplicate = db.prepare("SELECT id FROM mf_questions WHERE normalized = ? AND id <> ?").get(normalized, id);
    if (duplicate) throw new GameError(409, "A statement with the same normalized wording already exists.");
    const version = (existing?.current_version ?? 0) + 1;
    const previous = existing ? allQuestions(db).find((q) => q.id === id) : null;
    const day = new Date().toISOString().slice(0, 10);
    const question: Question = { ...raw, id, version, createdAt: previous?.createdAt ?? raw.createdAt ?? day,
      reviewedAt: raw.reviewStatus === "reviewed" ? day : null };
    if (existing) db.prepare("UPDATE mf_questions SET normalized = ?, current_version = ? WHERE id = ?").run(normalized, version, id);
    else db.prepare("INSERT INTO mf_questions VALUES (?, ?, ?)").run(id, normalized, version);
    db.prepare("INSERT INTO mf_question_versions VALUES (?, ?, ?, ?)").run(id, version, JSON.stringify(question), Date.now());
    return question;
  };
  router.post("/admin/questions", (req, res) => {
    const input = questionSchema.parse(req.body);
    const question = db.transaction(() => saveQuestion(input))();
    writeAuditLog(req.session.adminId!, "myth.question.create", { id: question.id, version: question.version });
    res.status(201).json(question);
  });
  router.put("/admin/questions/:id", (req, res) => {
    if (!db.prepare("SELECT id FROM mf_questions WHERE id = ?").get(req.params.id)) throw new GameError(404, "Statement not found.");
    const input = questionSchema.parse(req.body);
    const question = db.transaction(() => saveQuestion(input, req.params.id))();
    writeAuditLog(req.session.adminId!, "myth.question.version", { id: question.id, version: question.version });
    res.json(question);
  });
  router.delete("/admin/questions/:id", (req, res) => {
    const old = allQuestions(db).find((q) => q.id === req.params.id);
    if (!old) throw new GameError(404, "Statement not found.");
    const { version: _version, ...input } = old;
    const question = db.transaction(() => saveQuestion({ ...input, active: false }, old.id))();
    writeAuditLog(req.session.adminId!, "myth.question.archive", { id: old.id });
    res.json(question);
  });
  const columns = ["id", "statement", "fact", "explanation", "category", "difficulty", "hint", "source", "reviewStatus", "active", "image", "createdAt", "reviewedAt"];
  router.get("/admin/export", (req, res) => {
    const rows = allQuestions(db).map(({ version: _version, ...q }) => q);
    if (req.query.format === "csv") res.type("text/csv").attachment("myth-fact-statements.csv").send(csv(rows, columns));
    else res.json(rows);
  });
  router.post("/admin/import", (req, res) => {
    const input = z.object({ format: z.enum(["json", "csv"]), content: z.string().max(1_800_000), dryRun: z.boolean() }).strict().parse(req.body);
    const parsed = input.format === "json" ? JSON.parse(input.content) : parseCsv(input.content).map((row) => ({ ...row,
      fact: row.fact === "true" ? true : row.fact === "false" ? false : row.fact,
      active: row.active === "true" ? true : row.active === "false" ? false : row.active,
      difficulty: Number(row.difficulty), reviewedAt: row.reviewedAt || null
    }));
    const rows = z.array(questionSchema).min(1).max(500).parse(parsed);
    const keys = rows.map((q) => normalizeStatement(q.statement));
    if (new Set(keys).size !== keys.length) throw new GameError(400, "Import contains duplicate statements.");
    const ids = rows.flatMap((q) => q.id ? [q.id] : []);
    if (new Set(ids).size !== ids.length) throw new GameError(400, "Import contains duplicate IDs.");
    for (const q of rows) {
      const duplicate = db.prepare("SELECT id FROM mf_questions WHERE normalized = ?").get(normalizeStatement(q.statement)) as { id: string } | undefined;
      if (duplicate && duplicate.id !== q.id) throw new GameError(409, `Duplicate existing statement: ${q.statement}`);
    }
    if (!input.dryRun) {
      db.transaction(() => { for (const row of rows) saveQuestion(row); })();
      writeAuditLog(req.session.adminId!, "myth.questions.import", { count: rows.length });
    }
    res.json({ valid: true, count: rows.length, saved: !input.dryRun });
  });
  const challengeSchema = z.object({ title: z.string().trim().min(3).max(100), config: configSchema,
    questionIds: z.array(z.string().max(80)).min(0).max(30), participation: z.enum(["solo", "team", "both"]), revealAfterClose: z.boolean() }).strict();
  router.post("/admin/challenges", (req, res) => {
    const input = challengeSchema.parse(req.body);
    if (new Set(input.questionIds).size !== input.questionIds.length) throw new GameError(400, "The fixed set cannot contain duplicate statements.");
    const pool = allQuestions(db);
    const selected = input.questionIds.length ? input.questionIds.map((id) => {
      const q = pool.find((candidate) => candidate.id === id && candidate.active && candidate.reviewStatus === "reviewed");
      if (!q) throw new GameError(400, "Select active, reviewed statements only.");
      return q;
    }) : selectQuestions(pool, new Set(), input.config.questionCount, input.config);
    if (selected.length < 10 || selected.length > 30) throw new GameError(400, "An event requires 10–30 distinct statements.");
    const id = randomUUID();
    db.prepare(`INSERT INTO mf_challenges(id, title, version, question_refs, config, participation, reveal_after_close, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`)
      .run(id, input.title, JSON.stringify(selected.map((q) => ({ id: q.id, version: q.version }))), JSON.stringify(input.config), input.participation, Number(input.revealAfterClose), Date.now());
    writeAuditLog(req.session.adminId!, "myth.challenge.create", { id });
    res.status(201).json({ id });
  });
  router.post("/admin/challenges/:id/status", (req, res) => {
    const input = z.object({ published: z.boolean(), registrationOpen: z.boolean() }).strict().parse(req.body);
    const challenge = db.prepare("SELECT * FROM mf_challenges WHERE id = ?").get(req.params.id) as Challenge | undefined;
    if (!challenge) throw new GameError(404, "Challenge not found.");
    if (challenge.published && !input.published) throw new GameError(409, "Published challenges are immutable. Close registration instead.");
    if (!input.published && input.registrationOpen) throw new GameError(400, "Publish the fixed set before opening registration.");
    db.prepare("UPDATE mf_challenges SET published = ?, registration_open = ? WHERE id = ?").run(Number(input.published), Number(input.registrationOpen), challenge.id);
    writeAuditLog(req.session.adminId!, "myth.challenge.status", { id: challenge.id, ...input });
    publish(); res.json({ saved: true });
  });
  router.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof GameError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: "Invalid JSON content." }); return; }
    next(error);
  });
  return router;
}
