import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'code-atlas.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      git_url TEXT NOT NULL,
      encrypted_token TEXT,
      local_path TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      last_scanned_at TEXT,
      scan_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      file_count INTEGER DEFAULT 0,
      line_count INTEGER DEFAULT 0,
      complexity_score REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      language TEXT,
      line_count INTEGER DEFAULT 0,
      exports TEXT DEFAULT '[]',
      imports TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      target_module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      weight INTEGER DEFAULT 1,
      UNIQUE(source_module_id, target_module_id)
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
