import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { getDataDir } from "../utils/data-dir.js";
import * as schema from "./schema.js";

// ─── Singleton ────────────────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _raw: Database | null = null;

export function getDb(dataDir?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const dir = dataDir ?? getDataDir();
  mkdirSync(dir, { recursive: true });

  const dbPath = `${dir}/data.db`;
  _raw = new Database(dbPath);

  // WAL mode for better concurrent read performance
  _raw.run("PRAGMA journal_mode = WAL;");
  _raw.run("PRAGMA foreign_keys = ON;");

  _db = drizzle(_raw, { schema });
  runMigrations(_raw);
  return _db;
}

export function closeDb(): void {
  _raw?.close();
  _raw = null;
  _db = null;
}

/** Raw bun:sqlite handle — for json_extract and parameterized dynamic SQL. */
export function getRawDb(): Database {
  if (!_raw) getDb();
  if (!_raw) throw new Error("Database not initialized");
  return _raw;
}

/** @internal — used by test-helpers to inject an in-memory DB */
export function _setTestDb(db: ReturnType<typeof drizzle<typeof schema>>, raw: Database): void {
  _db = db;
  _raw = raw;
}

/** @internal — used by test-helpers to reset the singleton */
export function _resetDb(): void {
  _raw = null;
  _db = null;
}

// ─── Migration runner ─────────────────────────────────────────────────────────
function runMigrations(raw: Database): void {
  raw.run(`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      ran_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const migrationsDir = `${import.meta.dir}/migrations`;
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const ran = raw.query("SELECT name FROM __migrations WHERE name = ?").get(file);
    if (ran) continue;

    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      raw.run(stmt);
    }

    raw.query("INSERT INTO __migrations (name) VALUES (?)").run(file);
  }
}

// ─── Re-export schema ─────────────────────────────────────────────────────────
export * from "./schema.js";
