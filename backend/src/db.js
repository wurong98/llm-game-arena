import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "data.sqlite");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  description TEXT,
  key_hash TEXT NOT NULL,
  supported_games TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  agent_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1500,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  illegal_moves INTEGER NOT NULL DEFAULT 0,
  total_moves INTEGER NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, game_type)
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  player_x TEXT NOT NULL,
  player_o TEXT NOT NULL,
  board TEXT NOT NULL,
  turn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  winner TEXT,
  illegal_move_count_x INTEGER NOT NULL DEFAULT 0,
  illegal_move_count_o INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  move_index INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  mark TEXT NOT NULL,
  pos INTEGER,
  valid INTEGER NOT NULL,
  error TEXT,
  prompt_sent TEXT,
  raw_response TEXT,
  latency_ms INTEGER,
  at TEXT NOT NULL
);
`);
