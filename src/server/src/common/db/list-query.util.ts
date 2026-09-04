import { type Column, type SQL, and, asc, between, count, desc, eq, gt, gte, inArray, like, lt, lte, ne, or } from "drizzle-orm";
import { getDb } from "./client.js";
import { qall, qone } from "./query.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PagingResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Filter value formats (same convention as old TypeORM util):
 *   "lt:<val>"       → column < val
 *   "lte:<val>"      → column <= val
 *   "gt:<val>"       → column > val
 *   "gte:<val>"      → column >= val
 *   "ne:<val>"       → column != val  (ne:null → IS NOT NULL)
 *   "eq:<val>"       → column = val   (eq:null → IS NULL)
 *   "in:<a,b,c>"     → column IN (a, b, c)
 *   "range:<from,to>"→ column BETWEEN from AND to
 *   "<val>"          → column = val (plain equality)
 */
export type FilterValue = string | number | boolean | null | string[];

/**
 * Raw query from `c.req.query()` — flat key-value pairs.
 * Reserved keys (`page`, `limit`, `sorts`, `search`) are auto-extracted,
 * everything else is treated as a filter column.
 */
export type RawQuery = Record<string, string | undefined>;

/** Reserved query param keys that are NOT treated as filters. */
const RESERVED_KEYS = new Set(["page", "limit", "sorts", "search"]);

export interface ListQueryOptions<TTable extends { $inferSelect: any; _: { columns: Record<string, unknown> } }> {
  /**
   * The Drizzle table object to query.
   */
  table: TTable;
  /**
   * Column property names allowed for sorting.
   * Default: all column keys in the table.
   */
  allowedSorts?: (keyof TTable["_"]["columns"] & string)[];
  /**
   * Whitelisted column names for filter param.
   * Only these columns can be filtered.
   */
  allowedFilters?: (keyof TTable["_"]["columns"] & string)[];
  /**
   * Columns to run LIKE search against.
   */
  searchColumns?: (keyof TTable["_"]["columns"] & string)[];
  /**
   * Extra static WHERE conditions (always applied).
   */
  where?: SQL;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILTER_RE = /^(lt|lte|gt|gte|ne|eq|in|range):(.*)$/;

function parseFilterValue(col: Column, raw: FilterValue): SQL | undefined {
  const str = String(raw ?? "");
  const match = str.match(FILTER_RE);

  if (!match) {
    // Plain equality
    if (Array.isArray(raw)) return inArray(col, raw as string[]);
    return eq(col, raw as any);
  }

  const [, op, val] = match;

  switch (op) {
    case "lt":
      return lt(col, val);
    case "lte":
      return lte(col, val);
    case "gt":
      return gt(col, val);
    case "gte":
      return gte(col, val);
    case "ne":
      return val === "null" ? ne(col, null as any) : ne(col, val);
    case "eq":
      return val === "null" ? eq(col, null as any) : eq(col, val);
    case "in": {
      const parts = val.split(",").map((v) => v.trim());
      return inArray(col, parts);
    }
    case "range": {
      const parts = val.split(",").map((v) => v.trim());
      if (parts.length !== 2) {
        throw new Error(`Invalid range filter value: "${val}". Expected "from,to".`);
      }
      return between(col, parts[0], parts[1]);
    }
    default:
      return eq(col, val);
  }
}

function buildSortSQL(cols: Record<string, Column>, sortsParam?: string, allowedSorts?: string[]): SQL[] {
  if (!sortsParam?.trim()) {
    // Default: newest first if createdAt exists
    const createdAt = cols.createdAt;
    return createdAt ? [desc(createdAt)] : [];
  }

  const parts = sortsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const isDesc = part.startsWith("-");
    const key = isDesc ? part.slice(1) : part;

    if (allowedSorts && !allowedSorts.includes(key)) {
      throw new Error(`Invalid sort field: "${key}". Allowed: ${allowedSorts.join(", ")}`);
    }

    const col = cols[key];
    if (!col) {
      throw new Error(`Unknown column for sort: "${key}"`);
    }

    return isDesc ? desc(col) : asc(col);
  });
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Generic list query for Drizzle (SQLite or Postgres).
 *
 * Accepts a raw query object (e.g. `c.req.query()`) as the second parameter.
 * Reserved keys (`page`, `limit`, `sorts`, `search`) are auto-extracted;
 * every other key is treated as a filter column.
 *
 * Filter values support operator prefixes:
 *   `lt:`, `lte:`, `gt:`, `gte:`, `ne:`, `eq:`, `in:`, `range:` — or plain equality.
 *
 * @example
 * ```ts
 * // In route handler — just pass c.req.query() directly:
 * app.get("/", async (c) => c.json(
 *   listQuery({ table: agents, searchColumns: ["name"] }, c.req.query()),
 * ));
 *
 * // URL: /api/agents?page=1&limit=20&search=hello&status=active&sorts=-createdAt
 * // Omit limit to return all rows (page defaults to 1).
 * ```
 */
export async function listQuery<TTable extends { $inferSelect: any; _: { columns: Record<string, unknown> } }>(options: ListQueryOptions<TTable>, query: RawQuery = {}): Promise<PagingResult<TTable["$inferSelect"]>> {
  const { table, allowedSorts, allowedFilters, searchColumns, where: staticWhere } = options;

  // ── Parse reserved params ─────────────────────────────────────────────────
  // No limit → return all rows. page defaults to 1.
  const page = Math.max(1, Number(query.page) || 1);
  const hasLimit = query.limit !== undefined && query.limit !== "";
  const limit = hasLimit ? Math.min(200, Math.max(1, Number(query.limit))) : 0;
  const offset = hasLimit ? (page - 1) * limit : 0;
  const search = query.search;
  const sorts = query.sorts;

  // ── Collect filters (everything not reserved) ─────────────────────────────
  const filter: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value === undefined) continue;
    filter[key] = value;
  }

  const cols = table as unknown as Record<string, Column>;

  // ── Build WHERE conditions ─────────────────────────────────────────────────
  const conditions: SQL[] = [];

  if (staticWhere) {
    conditions.push(staticWhere);
  }

  // Filter
  for (const [key, rawValue] of Object.entries(filter)) {
    if (allowedFilters && !allowedFilters.includes(key)) {
      throw new Error(`Filter column "${key}" is not allowed. Allowed: ${allowedFilters.join(", ")}`);
    }

    const col = cols[key];
    if (!col) {
      throw new Error(`Unknown filter column: "${key}"`);
    }

    const sql = parseFilterValue(col, rawValue);
    if (sql) conditions.push(sql);
  }

  // Search
  if (search?.trim()) {
    if (!searchColumns?.length) {
      throw new Error("searchColumns is required when using search");
    }
    const term = `%${search.trim()}%`;
    const searchClauses = searchColumns.map((key) => {
      const col = cols[key];
      if (!col) throw new Error(`Unknown search column: "${key}"`);
      return like(col, term);
    });
    if (searchClauses.length === 1) {
      conditions.push(searchClauses[0]);
    } else {
      conditions.push(or(...searchClauses) as SQL);
    }
  }

  const whereSQL = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined;

  // ── Sort ──────────────────────────────────────────────────────────────────
  const orderSQL = buildSortSQL(cols, sorts, allowedSorts);

  // ── Execute ───────────────────────────────────────────────────────────────
  const db = getDb();

  const baseQuery = db
    .select()
    .from(table as any)
    .where(whereSQL)
    .orderBy(...orderSQL);

  const items = (await qall(hasLimit ? baseQuery.limit(limit).offset(offset) : baseQuery)) as TTable["$inferSelect"][];

  const countQuery = db
    .select({ value: count() })
    .from(table as any)
    .where(whereSQL);

  const totalRow = await qone(countQuery);
  const total = Number(totalRow?.value ?? 0);

  return {
    items,
    page,
    limit: hasLimit ? limit : total,
    total,
    totalPages: hasLimit ? Math.ceil(total / limit) : 1,
  };
}
