import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { resolve } from "node:path";
import { z } from "zod";
import { database, closeDatabase } from "./database.js";
import { requireAdmin, verifyPassword, writeAuditLog } from "./auth.js";
import { SQLiteSessionStore } from "./session-store.js";
import { createArena, gameIds } from "./arena.js";

const app = express();
const arena = createArena(database);
const listeners = new Set<express.Response>();
const publish = () => { for (const client of listeners) client.write("event: change\ndata: {}\n\n"); };
const port = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters.");
}

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"]
      }
    }
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    store: new SQLiteSessionStore(),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.get("/api/health", (_req, res) => {
  database.prepare("SELECT 1").get();
  res.json({ status: "ok" });
});

app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("event: change\ndata: {}\n\n");
  listeners.add(res);
  const timer = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  req.on("close", () => { clearInterval(timer); listeners.delete(res); });
});
app.get("/api/leaderboard/:game", (req, res) => {
  const game = z.enum(gameIds).safeParse(req.params.game);
  if (!game.success) { res.status(400).json({ error: "Unknown game." }); return; }
  res.json(arena.rankings(game.data));
});
app.get("/api/leaderboards", (_req, res) => {
  res.json(Object.fromEntries(gameIds.map((game) => [game, arena.rankings(game)])));
});
const playLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/api/play", playLimiter);
app.post("/api/play", (req, res) => {
  const input = z.object({ participantId: z.uuid(), game: z.enum(gameIds), challenger: z.string().trim().max(24) }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter a valid challenger name and game." }); return; }
  const id = arena.start(input.data.participantId, input.data.game, input.data.challenger);
  publish();
  res.status(201).json({ id });
});
app.post("/api/play/:id/heartbeat", (req, res) => {
  if (!arena.heartbeat(req.params.id)) { res.status(404).json({ error: "Active game session not found." }); return; }
  res.status(204).end();
});
app.delete("/api/play/:id", (req, res) => { arena.abandon(req.params.id); publish(); res.status(204).end(); });
app.post("/api/play/:id/complete", (req, res) => {
  const input = z.object({ score: z.number().int().nonnegative() }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid score." }); return; }
  const result = arena.finish(req.params.id, input.data.score);
  if (result !== "saved") {
    res.status(result === "missing" ? 404 : result === "conflict" ? 409 : 400).json({ error: "Score could not be accepted for this game session." });
    return;
  }
  publish();
  res.json({ saved: true });
});

app.get("/api/admin/session", (req, res) => {
  if (!req.session.adminId) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    user: { id: req.session.adminId, username: req.session.adminUsername, role: req.session.adminRole }
  });
});

app.post("/api/admin/login", loginLimiter, async (req, res, next) => {
  const input = z.object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256)
  }).safeParse(req.body);

  if (!input.success) {
    res.status(400).json({ error: "Enter a valid username and password." });
    return;
  }

  try {
    const admin = database
      .prepare("SELECT id, username, password_hash, role FROM admin_users WHERE username = ? COLLATE NOCASE")
      .get(input.data.username) as
      | { id: number; username: string; password_hash: string; role: string }
      | undefined;

    if (!admin || !(await verifyPassword(input.data.password, admin.password_hash))) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }

    req.session.regenerate((error) => {
      if (error) {
        next(error);
        return;
      }
      req.session.adminId = admin.id;
      req.session.adminUsername = admin.username;
      req.session.adminRole = admin.role;
      writeAuditLog(admin.id, "admin.login");
      req.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        res.json({
          authenticated: true,
          user: { id: admin.id, username: admin.username, role: admin.role }
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  const adminId = req.session.adminId!;
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie("connect.sid", { httpOnly: true, sameSite: "strict", secure: isProduction });
    writeAuditLog(adminId, "admin.logout");
    res.status(204).end();
  });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  res.json(arena.overview());
});

if (isProduction) {
  app.use(express.static(resolve("dist")));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(resolve("dist", "index.html"), (error) => {
        if (error) next(error);
      });
      return;
    }
    next();
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

const server = app.listen(port, "0.0.0.0", () => {
  const address = server.address();
  console.log(`EMUCON Arena API listening on port ${typeof address === "object" && address ? address.port : port}`);
});

function shutdown(): void {
  for (const client of listeners) client.end();
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
