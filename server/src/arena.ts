import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const gameIds = ["zero-point", "target-rush", "perfect-align", "brain-firewall", "snake", "myth-fact"] as const;
export type GameId = typeof gameIds[number];
export const scoreLimits: Record<GameId, number> = {
  "zero-point": 80_000, "target-rush": 10_000_000, "perfect-align": 100_000, "brain-firewall": 1_000_000, "snake": 10_000_000, "myth-fact": 1_000_000
};
const activeWindowMs = 90_000;

export function createArena(db: Database.Database) {
  return {
    start(participantId: string, game: GameId, challenger: string) {
      const id = randomUUID();
      const now = Date.now();
      db.transaction(() => {
        db.prepare("INSERT OR IGNORE INTO participants (id, created_at) VALUES (?, ?)").run(participantId, now);
        db.prepare(`INSERT INTO game_sessions (id, participant_id, game, challenger, started_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, participantId, game, challenger || "Anonymous Challenger", now, now);
      })();
      return id;
    },
    heartbeat(id: string) {
      return db.prepare("UPDATE game_sessions SET last_seen_at = ? WHERE id = ? AND completed_at IS NULL")
        .run(Date.now(), id).changes > 0;
    },
    finish(id: string, score: number) {
      const run = db.prepare("SELECT game, score, completed_at FROM game_sessions WHERE id = ?").get(id) as
        { game: GameId; score: number | null; completed_at: number | null } | undefined;
      if (!run) return "missing";
      if (run.game === "myth-fact") return "invalid"; // Only the server-owned answer engine can finalize this game.
      if (!Number.isSafeInteger(score) || score < 0 || score > scoreLimits[run.game]) return "invalid";
      if (run.completed_at !== null) return run.score === score ? "saved" : "conflict";
      const now = Date.now();
      db.prepare("UPDATE game_sessions SET score = ?, completed_at = ?, last_seen_at = ? WHERE id = ? AND completed_at IS NULL")
        .run(score, now, now, id);
      return "saved";
    },
    abandon(id: string) {
      db.prepare("UPDATE game_sessions SET last_seen_at = 0 WHERE id = ? AND completed_at IS NULL").run(id);
    },
    overview() {
      const count = (sql: string, ...params: number[]) => (db.prepare(sql).get(...params) as { count: number }).count;
      return {
        participants: count("SELECT COUNT(*) AS count FROM participants"),
        gamesPlayed: count("SELECT COUNT(*) AS count FROM game_sessions WHERE completed_at IS NOT NULL"),
        activeSessions: count("SELECT COUNT(*) AS count FROM game_sessions WHERE completed_at IS NULL AND last_seen_at > ?", Date.now() - activeWindowMs),
        database: "connected", configuredGames: gameIds.length, updatedAt: new Date().toISOString()
      };
    },
    rankings(game: GameId) {
      if (game === "myth-fact") {
        // Homepage preview uses only the current default Classic/solo rules, never mixed modes.
        const current = databaseConfig();
        const entries = db.prepare(`WITH best AS (
          SELECT g.id, g.challenger, a.score, a.finished_at AS completedAt,
          ROW_NUMBER() OVER (PARTITION BY a.identity ORDER BY a.score DESC, a.total_response_ms ASC, a.finished_at ASC) AS attempt
          FROM mf_attempts a JOIN game_sessions g ON g.id = a.id
          WHERE a.status = 'completed' AND a.mode = 'classic' AND a.team_id IS NULL AND a.config_id = ? AND a.config = ?
        ) SELECT id, challenger, score, completedAt FROM best WHERE attempt = 1 ORDER BY score DESC, completedAt ASC LIMIT 50`).all(current.id, current.config);
        return { game, entries: current.visible ? entries.map((entry, index) => ({ ...(entry as object), rank: index + 1 })) : [], updatedAt: new Date().toISOString() };
      }
      // Keep each participant's best attempt; ties go to the earlier completed run.
      const entries = db.prepare(`WITH best AS (
        SELECT id, challenger, score, completed_at,
          ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY score DESC, completed_at ASC, id ASC) AS attempt
        FROM game_sessions WHERE game = ? AND completed_at IS NOT NULL
      ) SELECT id, challenger, score, completed_at AS completedAt FROM best WHERE attempt = 1
        ORDER BY score DESC, completed_at ASC, id ASC LIMIT 50`).all(game);
      return { game, entries: entries.map((entry, index) => ({ ...(entry as object), rank: index + 1 })), updatedAt: new Date().toISOString() };
    }
  };

  function databaseConfig() {
    const row = db.prepare("SELECT id, config FROM mf_configurations ORDER BY id DESC LIMIT 1").get() as { id: number; config: string };
    return { ...row, visible: Boolean(JSON.parse(row.config).leaderboardVisible) };
  }
}
