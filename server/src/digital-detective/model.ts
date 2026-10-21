import type Database from "better-sqlite3";
import { z } from "zod";
import { difficulties, seedCases } from "./cases.js";
const profile = z.object({ seconds: z.number().int().min(60).max(3600), records: z.number().int().min(10).max(100) });
export const configSchema = z.object({ solo: z.boolean(), teams: z.boolean(), teamMin: z.number().int().min(2).max(12), teamMax: z.number().int().min(2).max(12), hints: z.boolean(), hintPenalty: z.number().int().min(0).max(200), speedBonus: z.number().int().min(0).max(200), maxAttempts: z.number().int().min(0).max(100), leaderboardVisible: z.boolean(), profiles: z.object({ beginner: profile, intermediate: profile, advanced: profile, expert: profile }) }).strict().refine(c => c.teamMax >= c.teamMin, "Invalid team size range.");
export type Config = z.infer<typeof configSchema>;
export const defaultConfig: Config = { solo: true, teams: true, teamMin: 2, teamMax: 6, hints: true, hintPenalty: 25, speedBonus: 200, maxAttempts: 0, leaderboardVisible: true, profiles: { beginner: { seconds: 720, records: 12 }, intermediate: { seconds: 600, records: 24 }, advanced: { seconds: 480, records: 48 }, expert: { seconds: 600, records: 72 } } };
export const competitionSchema = z.object({ title: z.string().trim().min(3).max(100), status: z.enum(["draft", "open", "closed"]), caseId: z.string().min(1).max(80), version: z.number().int().positive(), difficulty: z.enum(difficulties), seed: z.string().min(1).max(80), startAt: z.number().int().nonnegative(), endAt: z.number().int().positive(), participation: z.enum(["both", "solo", "team"]), revealAfterClose: z.boolean() }).strict().refine(c => c.endAt > c.startAt, "End must follow start.");
export function initializeDetective(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dd_cases (id TEXT PRIMARY KEY, current_version INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dd_versions (case_id TEXT NOT NULL REFERENCES dd_cases(id), version INTEGER NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(case_id, version));
    CREATE TABLE IF NOT EXISTS dd_config (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS competitions (id TEXT PRIMARY KEY, game TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dd_attempts (
      id TEXT PRIMARY KEY REFERENCES game_sessions(id), owner TEXT NOT NULL, case_id TEXT NOT NULL, version INTEGER NOT NULL,
      difficulty TEXT NOT NULL, seed TEXT NOT NULL, config TEXT NOT NULL, config_id INTEGER NOT NULL, competition_id TEXT REFERENCES competitions(id),
      mode TEXT NOT NULL, team_id TEXT REFERENCES teams(id), roster TEXT, board_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'briefing', started_at INTEGER, deadline INTEGER, finished_at INTEGER,
      progress TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0,
      submission TEXT, result TEXT, accuracy REAL, elapsed INTEGER,
      FOREIGN KEY(case_id, version) REFERENCES dd_versions(case_id, version)
    );
    CREATE INDEX IF NOT EXISTS dd_owner_idx ON dd_attempts(owner);
    CREATE INDEX IF NOT EXISTS dd_board_idx ON dd_attempts(board_key, status);
  `);
  if (!db.prepare("SELECT id FROM dd_config LIMIT 1").get()) db.prepare("INSERT INTO dd_config(content, created_at) VALUES (?, ?)").run(JSON.stringify(defaultConfig), Date.now());
  db.transaction(() => { for (const c of seedCases()) { if (db.prepare("SELECT id FROM dd_cases WHERE id = ?").get(c.id)) continue; db.prepare("INSERT INTO dd_cases VALUES (?, 1, 'published')").run(c.id); db.prepare("INSERT INTO dd_versions VALUES (?, 1, ?, ?)").run(c.id, JSON.stringify(c.content), Date.now()); } })();
  // Upgrade only untouched original seed dossiers. Attempts/competitions pinned
  // to v1 retain their original hints; authored cases are never overwritten.
  db.transaction(() => {
    const originals = seedCases(true);
    for (const c of seedCases()) {
      const row = db.prepare("SELECT c.current_version,v.content FROM dd_cases c JOIN dd_versions v ON v.case_id=c.id AND v.version=c.current_version WHERE c.id=?").get(c.id) as { current_version: number; content: string };
      if (row.current_version !== 1 || row.content !== JSON.stringify(originals.find(o => o.id === c.id)!.content)) continue;
      db.prepare("INSERT INTO dd_versions VALUES (?,2,?,?)").run(c.id, JSON.stringify(c.content), Date.now());
      db.prepare("UPDATE dd_cases SET current_version=2 WHERE id=?").run(c.id);
    }
  })();
}
export function configuration(db: Database.Database): { id: number; content: Config } {
  const row = db.prepare("SELECT * FROM dd_config ORDER BY id DESC LIMIT 1").get() as { id: number; content: string };
  return { id: row.id, content: JSON.parse(row.content) };
}
