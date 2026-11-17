import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));

let db: DatabaseSync | null = null;

/**
 * Shared SQLite connection. The web server and the background worker are
 * separate processes using the same file, so WAL + busy_timeout are required.
 */
export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = process.env.DATABASE_FILE ?? path.join(DATA_DIR, "evidence.db");
  db = openDatabase(file);
  return db;
}

export function openDatabase(file: string): DatabaseSync {
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec("PRAGMA busy_timeout = 10000;");
  conn.exec("PRAGMA foreign_keys = ON;");
  migrate(conn);
  return conn;
}

/** Test hook: swap the connection for an isolated database. */
export function setDbForTests(conn: DatabaseSync | null) {
  db = conn;
}

function migrate(conn: DatabaseSync) {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    conn.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version)),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    conn.exec("BEGIN IMMEDIATE");
    try {
      conn.exec(m.sql);
      conn.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(m.version, now());
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }
}

export function now(): string {
  return new Date().toISOString();
}

type Row = Record<string, SQLInputValue>;

export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return getDb().prepare(sql).run(...params);
}

/** Run fn inside an IMMEDIATE transaction (serialises writers across processes). */
export function tx<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
