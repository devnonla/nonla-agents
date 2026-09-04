import { describe, expect, test } from "bun:test";
import { parseDatabaseUrl, sqliteMigrationToPostgres, toPostgresPlaceholders } from "../common/db/dialect.js";

describe("db dialect", () => {
  test("parseDatabaseUrl defaults to sqlite", () => {
    expect(parseDatabaseUrl(undefined)).toEqual({ dialect: "sqlite" });
    expect(parseDatabaseUrl("")).toEqual({ dialect: "sqlite" });
    expect(parseDatabaseUrl("file:./data.db")).toEqual({ dialect: "sqlite" });
  });

  test("parseDatabaseUrl detects postgres URLs", () => {
    expect(parseDatabaseUrl("postgres://u:p@localhost:5432/db")).toEqual({
      dialect: "postgres",
      connectionString: "postgres://u:p@localhost:5432/db",
    });
    expect(parseDatabaseUrl("postgresql://localhost/db")).toEqual({
      dialect: "postgres",
      connectionString: "postgresql://localhost/db",
    });
  });

  test("sqliteMigrationToPostgres rewrites unixepoch", () => {
    expect(sqliteMigrationToPostgres("DEFAULT (unixepoch())")).toBe("DEFAULT (EXTRACT(EPOCH FROM NOW())::integer)");
  });

  test("toPostgresPlaceholders skips quoted question marks", () => {
    expect(toPostgresPlaceholders("SELECT * FROM t WHERE a = ? AND b = ?")).toBe("SELECT * FROM t WHERE a = $1 AND b = $2");
    expect(toPostgresPlaceholders("SELECT '?' FROM t WHERE a = ?")).toBe("SELECT '?' FROM t WHERE a = $1");
  });
});
