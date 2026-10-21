import type Database from "better-sqlite3";
import { z } from "zod";
import { categories, seedQuestions } from "./seed.js";

export const modes = ["classic", "speed", "survival", "confidence", "team", "event"] as const;
export type Mode = typeof modes[number];
export const configSchema = z.object({
  enabled: z.boolean(), availableModes: z.array(z.enum(modes)).min(1),
  questionCount: z.number().int().min(10).max(30), teamQuestionCount: z.number().int().min(10).max(15),
  questionSeconds: z.number().int().min(5).max(120), teamSeconds: z.number().int().min(10).max(180),
  totalSeconds: z.number().int().min(15).max(180),
  progressive: z.boolean(), basePoints: z.number().int().min(0).max(1000), speedBonus: z.number().int().min(0).max(500),
  streakBonus: z.number().int().min(0).max(100), streakCap: z.number().int().min(1).max(20),
  confidenceEnabled: z.boolean(), confidenceCorrect: z.tuple([z.number().int().min(0).max(1000), z.number().int().min(0).max(1000), z.number().int().min(0).max(1000)]),
  confidenceWrong: z.tuple([z.number().int().min(0).max(500), z.number().int().min(0).max(500), z.number().int().min(0).max(500)]),
  doubleBonus: z.number().int().min(0).max(1000), finalBonus: z.number().int().min(0).max(1000),
  hints: z.boolean(), solo: z.boolean(), teams: z.boolean(), teamMin: z.number().int().min(2).max(12), teamMax: z.number().int().min(2).max(12),
  leaderboardVisible: z.boolean(), maxAttempts: z.number().int().min(0).max(100),
  difficulty: z.number().int().min(1).max(4),
  categories: z.array(z.enum(categories)).min(1)
}).strict().refine((value) => value.teamMax >= value.teamMin, { message: "Maximum team size must be at least the minimum." });
export type Config = z.infer<typeof configSchema>;
export const defaultConfig: Config = {
  enabled: true, availableModes: [...modes], questionCount: 15, teamQuestionCount: 12,
  questionSeconds: 20, teamSeconds: 40, totalSeconds: 60,
  progressive: true, basePoints: 100, speedBonus: 50, streakBonus: 10, streakCap: 10,
  confidenceEnabled: true, confidenceCorrect: [100, 150, 200], confidenceWrong: [0, 25, 75],
  doubleBonus: 100, finalBonus: 150, hints: true, solo: true, teams: true, teamMin: 2, teamMax: 6,
  leaderboardVisible: true, maxAttempts: 0, difficulty: 4, categories: [...categories]
};
export const questionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  statement: z.string().trim().min(12).max(700), fact: z.boolean(), explanation: z.string().trim().min(20).max(2500),
  category: z.enum(categories), difficulty: z.number().int().min(1).max(4),
  hint: z.string().trim().max(700).default(""), source: z.string().trim().min(8).max(2000),
  reviewStatus: z.enum(["draft", "reviewed"]), active: z.boolean(),
  image: z.string().max(400_000).refine((value) => value === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value), "Use an uploaded PNG, JPEG, or WebP image (maximum 300 KB)."),
  createdAt: z.iso.date().optional(), reviewedAt: z.iso.date().nullable().optional()
}).strict();
export type QuestionInput = z.infer<typeof questionSchema>;
export type Question = QuestionInput & { id: string; version: number; createdAt: string; reviewedAt: string | null };
export const normalizeStatement = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function initializeMythFact(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, name TEXT NOT NULL, captain TEXT NOT NULL, members TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mf_questions (id TEXT PRIMARY KEY, normalized TEXT NOT NULL UNIQUE, current_version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mf_question_versions (question_id TEXT NOT NULL REFERENCES mf_questions(id), version INTEGER NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(question_id, version));
    CREATE TABLE IF NOT EXISTS mf_configurations (id INTEGER PRIMARY KEY AUTOINCREMENT, config TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mf_challenges (id TEXT PRIMARY KEY, title TEXT NOT NULL, version INTEGER NOT NULL, question_refs TEXT NOT NULL, config TEXT NOT NULL, participation TEXT NOT NULL, registration_open INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, reveal_after_close INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mf_entry_codes (id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES mf_challenges(id), code_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, used_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mf_attempts (
      id TEXT PRIMARY KEY REFERENCES game_sessions(id), owner TEXT NOT NULL, identity TEXT NOT NULL,
      participant_id TEXT NOT NULL REFERENCES participants(id), team_id TEXT REFERENCES teams(id), roster TEXT,
      mode TEXT NOT NULL, config_id INTEGER NOT NULL REFERENCES mf_configurations(id), config TEXT NOT NULL,
      board_key TEXT NOT NULL, challenge_id TEXT REFERENCES mf_challenges(id), challenge_version INTEGER,
      status TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL, deadline INTEGER,
      finished_at INTEGER, score INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, incorrect INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, lives INTEGER NOT NULL DEFAULT 3,
      hint_used INTEGER NOT NULL DEFAULT 0, total_response_ms INTEGER NOT NULL DEFAULT 0, record INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS mf_identity_history ON mf_attempts(identity, started_at DESC);
    CREATE INDEX IF NOT EXISTS mf_board ON mf_attempts(board_key, status, score DESC);
    CREATE TABLE IF NOT EXISTS mf_attempt_questions (
      attempt_id TEXT NOT NULL REFERENCES mf_attempts(id), ordinal INTEGER NOT NULL, question_id TEXT NOT NULL,
      version INTEGER NOT NULL, content TEXT NOT NULL, shown_at INTEGER, deadline INTEGER, answered_at INTEGER,
      answer INTEGER, confidence INTEGER, correct INTEGER, points INTEGER, bonus INTEGER, response_ms INTEGER, hinted INTEGER NOT NULL DEFAULT 0,
      pair_id INTEGER, final INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(attempt_id, ordinal), UNIQUE(attempt_id, question_id)
    );
  `);
  if (!(db.prepare("SELECT id FROM mf_configurations LIMIT 1").get())) {
    db.prepare("INSERT INTO mf_configurations(config, created_at) VALUES (?, ?)").run(JSON.stringify(defaultConfig), Date.now());
  }
  db.transaction(() => {
    for (const input of seedQuestions) {
      if (db.prepare("SELECT id FROM mf_questions WHERE id = ?").get(input.id)) continue;
      const question: Question = { ...input, version: 1 };
      questionSchema.parse(input);
      db.prepare("INSERT INTO mf_questions(id, normalized, current_version) VALUES (?, ?, 1)").run(input.id, normalizeStatement(input.statement));
      db.prepare("INSERT INTO mf_question_versions(question_id, version, content, created_at) VALUES (?, 1, ?, ?)").run(input.id, JSON.stringify(question), Date.now());
    }
  })();
}

export function currentConfiguration(db: Database.Database): { id: number; config: Config } {
  const row = db.prepare("SELECT id, config FROM mf_configurations ORDER BY id DESC LIMIT 1").get() as { id: number; config: string };
  return { id: row.id, config: JSON.parse(row.config) };
}
export function allQuestions(db: Database.Database): Question[] {
  return (db.prepare(`SELECT v.content FROM mf_questions q JOIN mf_question_versions v ON v.question_id = q.id AND v.version = q.current_version`).all() as { content: string }[]).map((row) => JSON.parse(row.content));
}
