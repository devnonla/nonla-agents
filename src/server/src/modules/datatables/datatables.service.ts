import { and, asc, eq, inArray } from "drizzle-orm";
import {
  COLUMN_TYPES,
  type ColumnType,
  type DatatableColumn,
  type DatatableProject,
  type DatatableRow,
  type DatatableTable,
  type NewDatatableColumn,
  type NewDatatableProject,
  type NewDatatableRow,
  type NewDatatableTable,
  datatableColumns,
  datatableProjects,
  datatableRows,
  datatableTables,
  getDb,
  getRawDb,
} from "../../common/db/client.js";
import { BadRequestException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { type OrderByItem, type WhereFilter, buildOrderBySql, buildWhereSql } from "./datatable-where.util.js";

const COLUMN_NAME_RE = /^[a-z][a-z0-9_]*$/;

function assertName(name: string, label: string) {
  const n = name?.trim() ?? "";
  if (!n) throw new BadRequestException(`${label} is required`);
  if (n.length > 120) throw new BadRequestException(`${label} is too long`);
  return n;
}

function assertColumnName(name: string) {
  const n = name?.trim() ?? "";
  if (!COLUMN_NAME_RE.test(n)) {
    throw new BadRequestException("Column name must match [a-z][a-z0-9_]*");
  }
  return n;
}

function assertColumnType(type: string): ColumnType {
  if (!(COLUMN_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException(`Invalid column type "${type}"`);
  }
  return type as ColumnType;
}

function validateCell(col: DatatableColumn, value: unknown, partial: boolean) {
  if (value === undefined) {
    if (!partial && col.required) throw new BadRequestException(`Column "${col.name}" is required`);
    return undefined;
  }
  if (value === null) {
    if (col.required) throw new BadRequestException(`Column "${col.name}" is required`);
    return null;
  }

  switch (col.type) {
    case "text":
      if (typeof value !== "string") throw new BadRequestException(`Column "${col.name}" expects text`);
      return value;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new BadRequestException(`Column "${col.name}" expects number`);
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw new BadRequestException(`Column "${col.name}" expects boolean`);
      return value;
    case "datetime":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(`Column "${col.name}" expects ISO datetime string`);
      }
      return value;
    case "select": {
      if (typeof value !== "string") throw new BadRequestException(`Column "${col.name}" expects select string`);
      const opts = col.options ?? [];
      if (opts.length > 0 && !opts.includes(value)) {
        throw new BadRequestException(`Column "${col.name}" must be one of: ${opts.join(", ")}`);
      }
      return value;
    }
    case "json":
      return value;
    default:
      return value;
  }
}

function validateRowData(columns: DatatableColumn[], data: Record<string, unknown>, partial: boolean) {
  const allowed = new Set(columns.map((c) => c.name));
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) throw new BadRequestException(`Unknown column "${key}"`);
  }
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    if (!(col.name in data)) {
      if (!partial && col.required) throw new BadRequestException(`Column "${col.name}" is required`);
      continue;
    }
    const v = validateCell(col, data[col.name], partial);
    if (v !== undefined) out[col.name] = v;
  }
  return out;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export function listProjects() {
  const db = getDb();
  const projects = db.select().from(datatableProjects).orderBy(asc(datatableProjects.name)).all();
  if (projects.length === 0) return [] as Array<DatatableProject & { tableCount: number; tableNames: string[] }>;

  const tables = db
    .select({ projectId: datatableTables.projectId, name: datatableTables.name })
    .from(datatableTables)
    .where(
      inArray(
        datatableTables.projectId,
        projects.map((p) => p.id),
      ),
    )
    .orderBy(asc(datatableTables.name))
    .all();

  const namesMap = new Map<string, string[]>();
  for (const t of tables) {
    const list = namesMap.get(t.projectId);
    if (list) list.push(t.name);
    else namesMap.set(t.projectId, [t.name]);
  }

  return projects.map((p) => {
    const tableNames = namesMap.get(p.id) ?? [];
    return { ...p, tableCount: tableNames.length, tableNames };
  });
}

export function getProject(id: string): DatatableProject | null {
  return getDb().select().from(datatableProjects).where(eq(datatableProjects.id, id)).get() ?? null;
}

export function getProjectByName(name: string): DatatableProject | null {
  return getDb().select().from(datatableProjects).where(eq(datatableProjects.name, name)).get() ?? null;
}

export function createProject(body: { name: string }) {
  const name = assertName(body.name, "name");
  if (getProjectByName(name)) throw new BadRequestException(`Project "${name}" already exists`);
  const now = new Date();
  const entry: NewDatatableProject = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
  getDb().insert(datatableProjects).values(entry).run();
  wsHub.emit("datatables:project-created", entry);
  return entry;
}

export function updateProject(id: string, body: { name?: string }) {
  const current = getProject(id);
  if (!current) throw new NotFoundException("Project not found");
  const name = body.name !== undefined ? assertName(body.name, "name") : current.name;
  if (name !== current.name && getProjectByName(name)) {
    throw new BadRequestException(`Project "${name}" already exists`);
  }
  const updatedAt = new Date();
  getDb().update(datatableProjects).set({ name, updatedAt }).where(eq(datatableProjects.id, id)).run();
  const updated = getProject(id)!;
  wsHub.emit("datatables:project-updated", updated);
  return updated;
}

export function deleteProject(id: string) {
  const current = getProject(id);
  if (!current) throw new NotFoundException("Project not found");
  getDb().delete(datatableProjects).where(eq(datatableProjects.id, id)).run();
  wsHub.emit("datatables:project-deleted", { id });
}

// ─── Tables ───────────────────────────────────────────────────────────────────

export function listTables(projectId: string) {
  if (!getProject(projectId)) throw new NotFoundException("Project not found");
  return getDb().select().from(datatableTables).where(eq(datatableTables.projectId, projectId)).orderBy(asc(datatableTables.name)).all();
}

/** All tables in a project with their columns — one round-trip for the schema canvas. */
export function getProjectSchema(projectId: string) {
  const project = getProject(projectId);
  if (!project) throw new NotFoundException("Project not found");

  const tables = listTables(projectId);
  if (tables.length === 0) {
    return { project, tables: [] as Array<DatatableTable & { columns: DatatableColumn[] }> };
  }

  const tableIds = tables.map((t) => t.id);
  const columns = getDb().select().from(datatableColumns).where(inArray(datatableColumns.tableId, tableIds)).orderBy(asc(datatableColumns.sortOrder), asc(datatableColumns.name)).all();

  const columnsByTable = new Map<string, DatatableColumn[]>();
  for (const col of columns) {
    const list = columnsByTable.get(col.tableId);
    if (list) list.push(col);
    else columnsByTable.set(col.tableId, [col]);
  }

  return {
    project,
    tables: tables.map((table) => ({
      ...table,
      columns: columnsByTable.get(table.id) ?? [],
    })),
  };
}

export function getTable(id: string): DatatableTable | null {
  return getDb().select().from(datatableTables).where(eq(datatableTables.id, id)).get() ?? null;
}

export function getTableByNames(projectName: string, tableName: string): { project: DatatableProject; table: DatatableTable } | null {
  const project = getProjectByName(projectName);
  if (!project) return null;
  const table =
    getDb()
      .select()
      .from(datatableTables)
      .where(and(eq(datatableTables.projectId, project.id), eq(datatableTables.name, tableName)))
      .get() ?? null;
  if (!table) return null;
  return { project, table };
}

/** Resolve project by id first, then by name (LLM may pass either after list_projects). */
export function resolveProject(ref: string): DatatableProject | null {
  const key = String(ref ?? "").trim();
  if (!key) return null;
  return getProject(key) ?? getProjectByName(key);
}

/** Resolve table within a project by table id first, then by name. */
export function resolveTableInProject(project: DatatableProject, tableRef: string): DatatableTable | null {
  const key = String(tableRef ?? "").trim();
  if (!key) return null;
  const byId = getTable(key);
  if (byId && byId.projectId === project.id) return byId;
  return (
    getDb()
      .select()
      .from(datatableTables)
      .where(and(eq(datatableTables.projectId, project.id), eq(datatableTables.name, key)))
      .get() ?? null
  );
}

/** Resolve project + table from refs that may be id or name. */
export function resolveProjectAndTable(projectRef: string, tableRef: string): { project: DatatableProject; table: DatatableTable } | null {
  const project = resolveProject(projectRef);
  if (!project) return null;
  const table = resolveTableInProject(project, tableRef);
  if (!table) return null;
  return { project, table };
}

export function createTable(projectId: string, body: { name: string }) {
  if (!getProject(projectId)) throw new NotFoundException("Project not found");
  const name = assertName(body.name, "name");
  const clash = getDb()
    .select()
    .from(datatableTables)
    .where(and(eq(datatableTables.projectId, projectId), eq(datatableTables.name, name)))
    .get();
  if (clash) throw new BadRequestException(`Table "${name}" already exists in this project`);
  const now = new Date();
  const entry: NewDatatableTable = { id: crypto.randomUUID(), projectId, name, createdAt: now, updatedAt: now };
  getDb().insert(datatableTables).values(entry).run();
  wsHub.emit("datatables:table-created", entry);
  return entry;
}

export function updateTable(id: string, body: { name?: string }) {
  const current = getTable(id);
  if (!current) throw new NotFoundException("Table not found");
  const name = body.name !== undefined ? assertName(body.name, "name") : current.name;
  if (name !== current.name) {
    const clash = getDb()
      .select()
      .from(datatableTables)
      .where(and(eq(datatableTables.projectId, current.projectId), eq(datatableTables.name, name)))
      .get();
    if (clash) throw new BadRequestException(`Table "${name}" already exists in this project`);
  }
  const updatedAt = new Date();
  getDb().update(datatableTables).set({ name, updatedAt }).where(eq(datatableTables.id, id)).run();
  const updated = getTable(id)!;
  wsHub.emit("datatables:table-updated", updated);
  return updated;
}

export function deleteTable(id: string) {
  const current = getTable(id);
  if (!current) throw new NotFoundException("Table not found");
  getDb().delete(datatableTables).where(eq(datatableTables.id, id)).run();
  wsHub.emit("datatables:table-deleted", { id, projectId: current.projectId });
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export function listColumns(tableId: string) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  return getDb().select().from(datatableColumns).where(eq(datatableColumns.tableId, tableId)).orderBy(asc(datatableColumns.sortOrder), asc(datatableColumns.name)).all();
}

export function getColumn(id: string): DatatableColumn | null {
  return getDb().select().from(datatableColumns).where(eq(datatableColumns.id, id)).get() ?? null;
}

/** Resolve column within a table by column id first, then by name. */
export function resolveColumnInTable(tableId: string, columnRef: string): DatatableColumn | null {
  const key = String(columnRef ?? "").trim();
  if (!key) return null;
  const byId = getColumn(key);
  if (byId && byId.tableId === tableId) return byId;
  return listColumns(tableId).find((c) => c.name === key) ?? null;
}

export function getSchemaByNames(projectName: string, tableName: string) {
  const found = getTableByNames(projectName, tableName);
  if (!found) throw new NotFoundException(`Table "${projectName}/${tableName}" not found`);
  return {
    project: found.project,
    table: found.table,
    columns: listColumns(found.table.id),
  };
}

/** Schema for one table; project/table refs accept id or name. */
export function getSchemaByRefs(projectRef: string, tableRef: string) {
  const found = resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return {
    project: found.project,
    table: found.table,
    columns: listColumns(found.table.id),
  };
}

/** Full project schema (all tables + columns); ref accepts id or name. */
export function getProjectSchemaByRef(projectRef: string) {
  const project = resolveProject(projectRef);
  if (!project) throw new NotFoundException(`Project "${projectRef}" not found`);
  return getProjectSchema(project.id);
}

/** @deprecated prefer getProjectSchemaByRef */
export function getProjectSchemaByName(projectName: string) {
  return getProjectSchemaByRef(projectName);
}

export function createColumn(tableId: string, body: { name: string; type: string; options?: string[] | null; required?: boolean; sortOrder?: number }) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  const name = assertColumnName(body.name ?? "");
  const type = assertColumnType(body.type);
  if (type === "select" && body.options !== undefined && body.options !== null && !Array.isArray(body.options)) {
    throw new BadRequestException("options must be a string array");
  }
  const clash = getDb()
    .select()
    .from(datatableColumns)
    .where(and(eq(datatableColumns.tableId, tableId), eq(datatableColumns.name, name)))
    .get();
  if (clash) throw new BadRequestException(`Column "${name}" already exists`);

  const existing = listColumns(tableId);
  const sortOrder = body.sortOrder ?? existing.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
  const entry: NewDatatableColumn = {
    id: crypto.randomUUID(),
    tableId,
    name,
    type,
    options: type === "select" ? (body.options ?? []) : null,
    required: Boolean(body.required),
    sortOrder,
    createdAt: new Date(),
  };
  getDb().insert(datatableColumns).values(entry).run();
  wsHub.emit("datatables:column-created", entry);
  return entry;
}

export function updateColumn(id: string, body: { name?: string; type?: string; options?: string[] | null; required?: boolean; sortOrder?: number }) {
  const current = getColumn(id);
  if (!current) throw new NotFoundException("Column not found");

  const name = body.name !== undefined ? assertColumnName(body.name) : current.name;
  if (name !== current.name) {
    const clash = getDb()
      .select()
      .from(datatableColumns)
      .where(and(eq(datatableColumns.tableId, current.tableId), eq(datatableColumns.name, name)))
      .get();
    if (clash) throw new BadRequestException(`Column "${name}" already exists`);
  }

  const type = body.type !== undefined ? assertColumnType(body.type) : current.type;
  let options = current.options;
  if (body.options !== undefined) {
    if (body.options !== null && !Array.isArray(body.options)) {
      throw new BadRequestException("options must be a string array");
    }
    options = type === "select" ? (body.options ?? []) : null;
  } else if (type !== "select") {
    options = null;
  }

  getDb()
    .update(datatableColumns)
    .set({
      name,
      type,
      options,
      required: body.required !== undefined ? Boolean(body.required) : current.required,
      sortOrder: body.sortOrder !== undefined ? body.sortOrder : current.sortOrder,
    })
    .where(eq(datatableColumns.id, id))
    .run();

  if (name !== current.name) {
    renameColumnNameInRows(current.tableId, current.name, name);
  }

  const updated = getColumn(id)!;
  wsHub.emit("datatables:column-updated", updated);
  return updated;
}

export function reorderColumns(tableId: string, orderedIds: string[]) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  const cols = listColumns(tableId);
  const idSet = new Set(cols.map((c) => c.id));
  if (orderedIds.length !== cols.length || orderedIds.some((id) => !idSet.has(id))) {
    throw new BadRequestException("orderedIds must include every column id exactly once");
  }
  const db = getDb();
  orderedIds.forEach((id, i) => {
    db.update(datatableColumns).set({ sortOrder: i }).where(eq(datatableColumns.id, id)).run();
  });
  const updated = listColumns(tableId);
  wsHub.emit("datatables:columns-reordered", { tableId, columns: updated });
  return updated;
}

export function deleteColumn(id: string) {
  const current = getColumn(id);
  if (!current) throw new NotFoundException("Column not found");
  stripColumnNameFromRows(current.tableId, current.name);
  getDb().delete(datatableColumns).where(eq(datatableColumns.id, id)).run();
  wsHub.emit("datatables:column-deleted", { id, tableId: current.tableId, name: current.name });
}

function stripColumnNameFromRows(tableId: string, name: string) {
  const rows = getDb().select().from(datatableRows).where(eq(datatableRows.tableId, tableId)).all();
  const db = getDb();
  const now = new Date();
  for (const row of rows) {
    if (!(name in (row.data ?? {}))) continue;
    const data = { ...row.data };
    delete data[name];
    db.update(datatableRows).set({ data, updatedAt: now }).where(eq(datatableRows.id, row.id)).run();
  }
}

function renameColumnNameInRows(tableId: string, from: string, to: string) {
  const rows = getDb().select().from(datatableRows).where(eq(datatableRows.tableId, tableId)).all();
  const db = getDb();
  const now = new Date();
  for (const row of rows) {
    if (!(from in (row.data ?? {}))) continue;
    const data = { ...row.data };
    data[to] = data[from];
    delete data[from];
    db.update(datatableRows).set({ data, updatedAt: now }).where(eq(datatableRows.id, row.id)).run();
  }
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

export function queryRows(
  tableId: string,
  opts: {
    where?: WhereFilter;
    order_by?: OrderByItem[];
    limit?: number;
    offset?: number;
  } = {},
) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  const columns = listColumns(tableId);
  const { sql: whereSql, params: whereParams } = buildWhereSql(opts.where, columns);
  const orderSql = buildOrderBySql(opts.order_by, columns);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const raw = getRawDb();
  const countParams = [tableId, ...whereParams] as (string | number | boolean | null)[];
  const countRow = raw.query(`SELECT COUNT(*) AS c FROM datatable_rows WHERE table_id = ?${whereSql}`).get(...countParams) as {
    c: number;
  };
  const listParams = [tableId, ...whereParams, limit, offset] as (string | number | boolean | null)[];
  const items = raw
    .query(
      `SELECT id, table_id AS tableId, data, created_at AS createdAt, updated_at AS updatedAt
       FROM datatable_rows WHERE table_id = ?${whereSql}${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...listParams) as Array<{
    id: string;
    tableId: string;
    data: string;
    createdAt: number;
    updatedAt: number;
  }>;

  return {
    items: items.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
      createdAt: new Date(r.createdAt * 1000),
      updatedAt: new Date(r.updatedAt * 1000),
    })),
    total: countRow.c,
    limit,
    offset,
  };
}

export function getRow(id: string): DatatableRow | null {
  return getDb().select().from(datatableRows).where(eq(datatableRows.id, id)).get() ?? null;
}

export function insertRows(tableId: string, rows: Record<string, unknown>[]) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException("rows must be a non-empty array");
  if (rows.length > 200) throw new BadRequestException("Cannot insert more than 200 rows at once");
  const columns = listColumns(tableId);
  const now = new Date();
  const created: DatatableRow[] = [];
  const db = getDb();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException("Each row must be an object");
    }
    const data = validateRowData(columns, raw as Record<string, unknown>, false);
    const entry: NewDatatableRow = {
      id: crypto.randomUUID(),
      tableId,
      data,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(datatableRows).values(entry).run();
    created.push(getRow(entry.id as string) ?? (entry as DatatableRow));
  }
  wsHub.emit("datatables:rows-created", { tableId, rows: created });
  return created;
}

export function updateRow(id: string, data: Record<string, unknown>, partial = true) {
  const current = getRow(id);
  if (!current) throw new NotFoundException("Row not found");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BadRequestException("data must be an object");
  }
  const columns = listColumns(current.tableId);
  const patch = validateRowData(columns, data, partial);
  const next = partial ? { ...current.data, ...patch } : patch;
  for (const col of columns) {
    if (col.required && (next[col.name] === undefined || next[col.name] === null)) {
      throw new BadRequestException(`Column "${col.name}" is required`);
    }
  }
  const updatedAt = new Date();
  getDb().update(datatableRows).set({ data: next, updatedAt }).where(eq(datatableRows.id, id)).run();
  const updated = getRow(id)!;
  wsHub.emit("datatables:row-updated", updated);
  return updated;
}

export function deleteRow(id: string) {
  const current = getRow(id);
  if (!current) throw new NotFoundException("Row not found");
  getDb().delete(datatableRows).where(eq(datatableRows.id, id)).run();
  wsHub.emit("datatables:row-deleted", { id, tableId: current.tableId });
}

export function bulkDeleteRows(tableId: string, rowIds: string[]) {
  if (!getTable(tableId)) throw new NotFoundException("Table not found");
  if (!Array.isArray(rowIds) || rowIds.length === 0) throw new BadRequestException("rowIds required");
  const db = getDb();
  let deleted = 0;
  for (const id of rowIds) {
    const row = getRow(id);
    if (!row || row.tableId !== tableId) continue;
    db.delete(datatableRows).where(eq(datatableRows.id, id)).run();
    deleted++;
  }
  wsHub.emit("datatables:rows-deleted", { tableId, rowIds, deleted });
  return { deleted };
}

// ─── Ref-based helpers (SDK / builtin) — project/table accept id or name ──────

export function queryRowsByName(projectRef: string, tableRef: string, opts: { where?: WhereFilter; order_by?: OrderByItem[]; limit?: number; offset?: number } = {}) {
  const found = resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return queryRows(found.table.id, opts);
}

export function insertRowsByName(projectRef: string, tableRef: string, rows: Record<string, unknown>[]) {
  const found = resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return insertRows(found.table.id, rows);
}

export function updateRowByName(projectRef: string, tableRef: string, rowId: string, data: Record<string, unknown>) {
  const found = resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  const row = getRow(rowId);
  if (!row || row.tableId !== found.table.id) throw new NotFoundException("Row not found");
  return updateRow(rowId, data, true);
}

export function deleteRowsByName(projectRef: string, tableRef: string, rowIds: string[]) {
  const found = resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return bulkDeleteRows(found.table.id, rowIds);
}
