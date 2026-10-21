import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initializeMythFact } from "./myth-fact/model.js";
import { initializeDetective } from "./digital-detective/model.js";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/emucon.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'event_manager', 'volunteer', 'display_operator')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL REFERENCES participants(id),
    game TEXT NOT NULL CHECK (game IN ('zero-point', 'target-rush', 'perfect-align', 'brain-firewall', 'snake', 'myth-fact', 'digital-detective')),
    challenger TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    completed_at INTEGER,
    score INTEGER CHECK (score >= 0)
  );
  CREATE INDEX IF NOT EXISTS game_rankings_idx ON game_sessions(game, score DESC, completed_at);
  CREATE INDEX IF NOT EXISTS game_activity_idx ON game_sessions(last_seen_at) WHERE completed_at IS NULL;
`);

// SQLite cannot alter a CHECK constraint. Upgrade existing event databases atomically,
// retaining every session, score and existing extension foreign-key reference.
const gameTable = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_sessions'").get() as { sql: string };
if (!gameTable.sql.includes("'digital-detective'")) {
  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(`
      CREATE TABLE game_sessions_upgrade (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL REFERENCES participants(id),
        game TEXT NOT NULL CHECK (game IN ('zero-point', 'target-rush', 'perfect-align', 'brain-firewall', 'snake', 'myth-fact', 'digital-detective')),
        challenger TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        completed_at INTEGER,
        score INTEGER CHECK (score >= 0)
      );
      INSERT INTO game_sessions_upgrade (id, participant_id, game, challenger, started_at, last_seen_at, completed_at, score)
        SELECT id, participant_id, game, challenger, started_at, last_seen_at, completed_at, score FROM game_sessions;
      DROP TABLE game_sessions;
      ALTER TABLE game_sessions_upgrade RENAME TO game_sessions;
      CREATE INDEX game_rankings_idx ON game_sessions(game, score DESC, completed_at);
      CREATE INDEX game_activity_idx ON game_sessions(last_seen_at) WHERE completed_at IS NULL;
    `);
      if ((database.pragma("foreign_key_check") as unknown[]).length) throw new Error("Game migration failed foreign-key integrity check.");
    })();
  } finally { database.pragma("foreign_keys = ON"); }
}

initializeMythFact(database);
initializeDetective(database);

export function closeDatabase(): void {
  database.close();
}
