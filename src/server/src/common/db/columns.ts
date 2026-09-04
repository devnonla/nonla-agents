/**
 * Dialect-aware Drizzle column helpers.
 *
 * Postgres keeps the same on-disk layout as SQLite (TEXT / INTEGER, unix-second
 * timestamps, JSON as TEXT) so one set of SQL migrations works on both.
 * TypeScript types stay the SQLite schema types.
 */

import { sql } from "drizzle-orm";
import { customType, integer as pgInteger, primaryKey as pgPrimaryKey, pgTable, text as pgText } from "drizzle-orm/pg-core";
import { integer as sqliteInteger, primaryKey as sqlitePrimaryKey, sqliteTable as sqliteTableOrig, text as sqliteText } from "drizzle-orm/sqlite-core";
import { getDialect } from "./dialect.js";

const PG = getDialect() === "postgres";

export const sqliteTable = (PG ? pgTable : sqliteTableOrig) as typeof sqliteTableOrig;
export const text = (PG ? pgText : sqliteText) as typeof sqliteText;
export const integer = (PG ? pgInteger : sqliteInteger) as typeof sqliteInteger;
export const primaryKey = (PG ? pgPrimaryKey : sqlitePrimaryKey) as typeof sqlitePrimaryKey;

export const sqlNow = PG ? sql`(EXTRACT(EPOCH FROM NOW())::integer)` : sql`(unixepoch())`;

const pgBoolInt = customType<{ data: boolean; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: boolean) {
    return value ? 1 : 0;
  },
  fromDriver(value: unknown) {
    return value === true || value === 1 || value === "1" || value === "t";
  },
});

const pgTsInt = customType<{ data: Date; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: Date) {
    return Math.floor(value.getTime() / 1000);
  },
  fromDriver(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n)) return new Date(0);
    return new Date(n > 1e12 ? n : n * 1000);
  },
});

const pgJsonText = customType<{ data: unknown; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value: unknown) {
    return JSON.stringify(value ?? null);
  },
  fromDriver(value: unknown) {
    if (value == null) return value;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
});

function sqliteBool(name: string) {
  return sqliteInteger(name, { mode: "boolean" });
}

function sqliteTs(name: string) {
  return sqliteInteger(name, { mode: "timestamp" });
}

function sqliteJson(name: string) {
  return sqliteText(name, { mode: "json" });
}

export function boolCol(name: string) {
  return (PG ? pgBoolInt(name) : sqliteBool(name)) as unknown as ReturnType<typeof sqliteBool>;
}

export function tsCol(name: string) {
  return (PG ? pgTsInt(name) : sqliteTs(name)) as unknown as ReturnType<typeof sqliteTs>;
}

export function jsonCol(name: string) {
  return (PG ? pgJsonText(name) : sqliteJson(name)) as unknown as ReturnType<typeof sqliteJson>;
}
