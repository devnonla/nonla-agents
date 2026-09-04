/**
 * Database dialect — SQLite (default) or PostgreSQL via DATABASE_URL.
 *
 *   unset / sqlite file          → bun:sqlite at {DATA_DIR}/data.db
 *   postgres://… / postgresql:// → Bun SQL + Drizzle pg driver
 */

export type DbDialect = "sqlite" | "postgres";

export function parseDatabaseUrl(url: string | undefined = process.env.DATABASE_URL): { dialect: DbDialect; connectionString?: string } {
  const raw = url?.trim();
  if (!raw) return { dialect: "sqlite" };
  const lower = raw.toLowerCase();
  if (lower.startsWith("postgres://") || lower.startsWith("postgresql://")) {
    return { dialect: "postgres", connectionString: raw };
  }
  return { dialect: "sqlite" };
}

export function getDialect(): DbDialect {
  return parseDatabaseUrl().dialect;
}

/** Rewrite SQLite migration SQL so it can run on Postgres (same INTEGER/TEXT layout). */
export function sqliteMigrationToPostgres(sql: string): string {
  return sql.replace(/\bunixepoch\(\)/g, "EXTRACT(EPOCH FROM NOW())::integer");
}

/** Convert `?` placeholders to `$1, $2, …` for Postgres. Does not touch `?` inside quoted strings. */
export function toPostgresPlaceholders(sql: string): string {
  let n = 0;
  let out = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote && sql[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "?") {
      n += 1;
      out += `$${n}`;
      continue;
    }
    out += ch;
  }
  return out;
}
