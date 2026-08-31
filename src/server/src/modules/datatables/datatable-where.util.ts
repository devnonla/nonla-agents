import type { ColumnType, DatatableColumn } from "../../common/db/schema.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";

export type OrderByItem = { key: string; dir?: "asc" | "desc" };

const OPS = new Set(["$eq", "$neq", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$contains", "$exists"]);

type ColumnMap = Map<string, DatatableColumn>;

function jsonPath(key: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    throw new BadRequestException(`Invalid column key in where: "${key}"`);
  }
  return `$.${key}`;
}

function extractExpr(key: string): string {
  return `json_extract(data, '${jsonPath(key)}')`;
}

function assertKnownKey(key: string, columns: ColumnMap) {
  if (!columns.has(key)) {
    throw new BadRequestException(`Unknown column key in where: "${key}"`);
  }
}

function coerceForCompare(col: DatatableColumn, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  switch (col.type as ColumnType) {
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
      throw new BadRequestException(`Column "${col.name}" expects a number`);
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === 1) return true;
      if (value === "false" || value === 0) return false;
      throw new BadRequestException(`Column "${col.name}" expects a boolean`);
    case "datetime":
    case "text":
    case "select":
      return typeof value === "string" ? value : String(value);
    case "json":
      return value;
    default:
      return value;
  }
}

function pushOp(parts: string[], params: unknown[], key: string, op: string, rawValue: unknown, columns: ColumnMap) {
  assertKnownKey(key, columns);
  const col = columns.get(key)!;
  const expr = extractExpr(key);

  if (op === "$exists") {
    const exists = Boolean(rawValue);
    parts.push(exists ? `${expr} IS NOT NULL` : `${expr} IS NULL`);
    return;
  }

  if (op === "$in" || op === "$nin") {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      throw new BadRequestException(`${op} requires a non-empty array for "${key}"`);
    }
    const values = rawValue.map((v) => coerceForCompare(col, v));
    const placeholders = values.map(() => "?").join(", ");
    parts.push(`${expr} ${op === "$in" ? "IN" : "NOT IN"} (${placeholders})`);
    params.push(...values);
    return;
  }

  if (op === "$contains") {
    if (col.type === "json") {
      parts.push(`EXISTS (SELECT 1 FROM json_each(${expr}) WHERE json_each.value = ?)`);
      params.push(typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean" ? rawValue : JSON.stringify(rawValue));
      return;
    }
    const needle = String(coerceForCompare(col, rawValue));
    parts.push(`LOWER(CAST(${expr} AS TEXT)) LIKE ?`);
    params.push(`%${needle.toLowerCase()}%`);
    return;
  }

  const value = coerceForCompare(col, rawValue);
  switch (op) {
    case "$eq":
      parts.push(`${expr} = ?`);
      params.push(value);
      break;
    case "$neq":
      parts.push(`(${expr} IS NULL OR ${expr} != ?)`);
      params.push(value);
      break;
    case "$gt":
      parts.push(`${expr} > ?`);
      params.push(value);
      break;
    case "$gte":
      parts.push(`${expr} >= ?`);
      params.push(value);
      break;
    case "$lt":
      parts.push(`${expr} < ?`);
      params.push(value);
      break;
    case "$lte":
      parts.push(`${expr} <= ?`);
      params.push(value);
      break;
    default:
      throw new BadRequestException(`Unsupported operator "${op}"`);
  }
}

export type WhereBranch = Record<string, unknown>;
/** Object = AND of fields. Array of objects = OR of those AND-groups. */
export type WhereFilter = WhereBranch | WhereBranch[];

function buildAndGroup(where: WhereBranch, colMap: ColumnMap): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];

  for (const [key, clause] of Object.entries(where)) {
    if (clause !== null && typeof clause === "object" && !Array.isArray(clause)) {
      const ops = Object.entries(clause as Record<string, unknown>);
      if (ops.length === 0) continue;
      for (const [op, value] of ops) {
        if (!OPS.has(op)) throw new BadRequestException(`Unsupported operator "${op}" on "${key}"`);
        pushOp(parts, params, key, op, value, colMap);
      }
    } else {
      pushOp(parts, params, key, "$eq", clause, colMap);
    }
  }

  if (parts.length === 0) return { sql: "", params: [] };
  return { sql: parts.join(" AND "), params };
}

function assertWhereBranch(branch: unknown, index?: number): WhereBranch {
  if (branch === null || typeof branch !== "object" || Array.isArray(branch)) {
    const where = index === undefined ? "where" : `where[${index}]`;
    throw new BadRequestException(`${where} must be an object of column conditions`);
  }
  return branch as WhereBranch;
}

/** Build SQL fragments + bind params. Object = AND; array of objects = OR of AND-groups. */
export function buildWhereSql(where: WhereFilter | null | undefined, columns: DatatableColumn[]): { sql: string; params: unknown[] } {
  if (where == null) return { sql: "", params: [] };

  const colMap: ColumnMap = new Map(columns.map((c) => [c.name, c]));

  if (Array.isArray(where)) {
    if (where.length === 0) return { sql: "", params: [] };
    const groups: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < where.length; i++) {
      const group = buildAndGroup(assertWhereBranch(where[i], i), colMap);
      if (!group.sql) continue;
      groups.push(`(${group.sql})`);
      params.push(...group.params);
    }
    if (groups.length === 0) return { sql: "", params: [] };
    if (groups.length === 1) return { sql: ` AND ${groups[0]}`, params };
    return { sql: ` AND (${groups.join(" OR ")})`, params };
  }

  const group = buildAndGroup(assertWhereBranch(where), colMap);
  if (!group.sql) return { sql: "", params: [] };
  return { sql: ` AND ${group.sql}`, params: group.params };
}

const ROW_META_ORDER: Record<string, string> = {
  created_at: "created_at",
  updated_at: "updated_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function buildOrderBySql(orderBy: OrderByItem[] | null | undefined, columns: DatatableColumn[]): string {
  if (!orderBy?.length) return " ORDER BY created_at DESC";
  const colMap = new Map(columns.map((c) => [c.name, c]));
  const parts: string[] = [];
  for (const item of orderBy) {
    const key = item?.key;
    const dir = item.dir === "asc" ? "ASC" : "DESC";
    const metaCol = key ? ROW_META_ORDER[key] : undefined;
    if (metaCol) {
      parts.push(`${metaCol} ${dir}`);
      continue;
    }
    if (!key || !colMap.has(key)) {
      throw new BadRequestException(`Invalid order_by key: "${key}"`);
    }
    parts.push(`${extractExpr(key)} ${dir}`);
  }
  return ` ORDER BY ${parts.join(", ")}`;
}
