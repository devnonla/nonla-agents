import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/bun-sql";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { getDataDir } from "../utils/data-dir.js";
import { getDialect, parseDatabaseUrl, sqliteMigrationToPostgres } from "./dialect.js";
import * as schema from "./schema.js";

export type AppDb = BunSQLiteDatabase<typeof schema>;

let _db: AppDb | null = null;
let _raw: Database | null = null;
let _pg: SQL | null = null;
let _dialect: "sqlite" | "postgres" = "sqlite";

export function getDbDialect(): "sqlite" | "postgres" {
  return _dialect;
}

function asAppDb(db: unknown): AppDb {
  return db as AppDb;
}

function initSqlite(dataDir?: string): AppDb {
  const dir = dataDir ?? getDataDir();
  mkdirSync(dir, { recursive: true });

  const dbPath = `${dir}/data.db`;
  _raw = new Database(dbPath);
  _raw.run("PRAGMA journal_mode = WAL;");
  _raw.run("PRAGMA foreign_keys = ON;");
  _dialect = "sqlite";
  _db = asAppDb(drizzleSqlite(_raw, { schema }));
  runSqliteMigrations(_raw);
  return _db;
}

async function initPostgres(connectionString: string): Promise<AppDb> {
  _pg = new SQL(connectionString);
  await _pg.connect();
  _dialect = "postgres";
  _db = asAppDb(drizzlePg({ client: _pg, schema }));
  await runPostgresMigrations(_pg);
  return _db;
}

/**
 * Open the database (SQLite file or Postgres URL) and run migrations.
 * Call once at process start. Tests inject via `_setTestDb` instead.
 */
export async function initDb(dataDir?: string): Promise<AppDb> {
  if (_db) return _db;
  const parsed = parseDatabaseUrl();
  if (parsed.dialect === "postgres") {
    if (!parsed.connectionString) throw new Error("DATABASE_URL is missing");
    await initPostgres(parsed.connectionString);
  } else {
    initSqlite(dataDir);
  }
  await warmupSecrets();
  return _db!;
}

/**
 * Return the Drizzle client. SQLite may lazy-init; Postgres requires `initDb()` first.
 *
 * Always `await` query builders (`.select()`, `.insert()`, …). Do not use SQLite-only
 * `.get()` / `.all()` / `.run()` — those throw on Postgres.
 */
export function getDb(dataDir?: string): AppDb {
  if (_db) return _db;
  if (getDialect() === "postgres") {
    throw new Error("Database not initialized. Call await initDb() before getDb() when using PostgreSQL.");
  }
  return initSqlite(dataDir);
}

export async function closeDb(): Promise<void> {
  const pg = _pg;
  const raw = _raw;
  _pg = null;
  _raw = null;
  _db = null;
  _dialect = "sqlite";
  raw?.close();
  if (pg) await pg.end({ timeout: 5 });
}

/** @deprecated Use executeRaw — raw bun:sqlite is SQLite-only. */
export function getRawDb(): Database {
  if (!_raw) getDb();
  if (!_raw) throw new Error("Raw SQLite handle is not available (PostgreSQL mode)");
  return _raw;
}

/** @internal — used by test-helpers to inject an in-memory DB */
export function _setTestDb(db: AppDb, raw: Database): void {
  _db = db;
  _raw = raw;
  _pg = null;
  _dialect = "sqlite";
}

/** @internal — used by test-helpers to reset the singleton */
export function _resetDb(): void {
  _raw = null;
  _pg = null;
  _db = null;
  _dialect = "sqlite";
}

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function runSqliteMigrations(raw: Database): void {
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

    const text = readFileSync(`${migrationsDir}/${file}`, "utf8");
    for (const stmt of splitSqlStatements(text)) {
      raw.run(stmt);
    }
    raw.query("INSERT INTO __migrations (name) VALUES (?)").run(file);
  }
}

async function runPostgresMigrations(client: SQL): Promise<void> {
  await client`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      ran_at INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::integer
    )
  `;

  const migrationsDir = `${import.meta.dir}/migrations`;
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const ran = await client`SELECT name FROM __migrations WHERE name = ${file}`;
    if (Array.isArray(ran) && ran.length > 0) continue;

    const text = sqliteMigrationToPostgres(readFileSync(`${migrationsDir}/${file}`, "utf8"));
    try {
      for (const stmt of splitSqlStatements(text)) {
        await client.unsafe(stmt);
      }
      await client`INSERT INTO __migrations (name) VALUES (${file})`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Postgres migration failed (${file}): ${msg}`, { cause: err });
    }
  }
}

function findUnquotedQuestion(sqlText: string): number {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (quote) {
      if (ch === quote && sqlText[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "?") return i;
  }
  return -1;
}

function bindSql(query: string, params: unknown[]) {
  const fragments: ReturnType<typeof sql>[] = [];
  let remaining = query;
  let pi = 0;
  while (true) {
    const idx = findUnquotedQuestion(remaining);
    if (idx < 0) {
      if (remaining) fragments.push(sql.raw(remaining));
      break;
    }
    if (idx > 0) fragments.push(sql.raw(remaining.slice(0, idx)));
    fragments.push(sql`${params[pi++]}`);
    remaining = remaining.slice(idx + 1);
  }
  return sql.join(fragments, sql.raw(""));
}

/**
 * Parameterized raw SQL (`?` placeholders) for both SQLite and Postgres.
 * Used by datatable JSON filters.
 */
export async function executeRaw<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!_db) getDb();
  if (_dialect === "sqlite") {
    if (!_raw) throw new Error("Database not initialized");
    return _raw.query(query).all(...(params as (string | number | boolean | null)[])) as T[];
  }
  const result = await (_db as AppDb & { execute: (q: unknown) => Promise<unknown> }).execute(bindSql(query, params));
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function warmupSecrets(): Promise<void> {
  const { loadSecretEncryptionKey } = await import("../crypto/secret-crypto.js");
  const { loadJwtSecret } = await import("../middleware/auth.middleware.js");
  const { getConfiguredTimezone } = await import("../utils/cronHelper.js");
  await loadSecretEncryptionKey();
  await loadJwtSecret();
  await getConfiguredTimezone();
}

export { bindSql };
export * from "./schema.js";
export { getDialect } from "./dialect.js";
