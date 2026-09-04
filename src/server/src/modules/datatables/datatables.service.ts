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
  executeRaw,
  getDb,
} from "../../common/db/client.js";
import { qall, qone, qrun } from "../../common/db/query.js";
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

export async function listProjects() {
  const db = getDb();
  const projects = await qall(db.select().from(datatableProjects).orderBy(asc(datatableProjects.name)));
  if (projects.length === 0) return [] as Array<DatatableProject & { tableCount: number; tableNames: string[] }>;

  const tables = await qall(
    db
      .select({ projectId: datatableTables.projectId, name: datatableTables.name })
      .from(datatableTables)
      .where(
        inArray(
          datatableTables.projectId,
          projects.map((p) => p.id),
        ),
      )
      .orderBy(asc(datatableTables.name)),
  );

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

export async function getProject(id: string): Promise<DatatableProject | null> {
  return (await qone(getDb().select().from(datatableProjects).where(eq(datatableProjects.id, id)))) ?? null;
}

export async function getProjectByName(name: string): Promise<DatatableProject | null> {
  return (await qone(getDb().select().from(datatableProjects).where(eq(datatableProjects.name, name)))) ?? null;
}

export async function createProject(body: { name: string }) {
  const name = assertName(body.name, "name");
  if (await getProjectByName(name)) throw new BadRequestException(`Project "${name}" already exists`);
  const now = new Date();
  const entry: NewDatatableProject = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
  await qrun(getDb().insert(datatableProjects).values(entry));
  wsHub.emit("datatables:project-created", entry);
  return entry;
}

export async function updateProject(id: string, body: { name?: string }) {
  const current = await getProject(id);
  if (!current) throw new NotFoundException("Project not found");
  const name = body.name !== undefined ? assertName(body.name, "name") : current.name;
  if (name !== current.name && (await getProjectByName(name))) {
    throw new BadRequestException(`Project "${name}" already exists`);
  }
  const updatedAt = new Date();
  await qrun(getDb().update(datatableProjects).set({ name, updatedAt }).where(eq(datatableProjects.id, id)));
  const updated = (await getProject(id))!;
  wsHub.emit("datatables:project-updated", updated);
  return updated;
}

export async function deleteProject(id: string) {
  const current = await getProject(id);
  if (!current) throw new NotFoundException("Project not found");
  await qrun(getDb().delete(datatableProjects).where(eq(datatableProjects.id, id)));
  wsHub.emit("datatables:project-deleted", { id });
}

// ─── Tables ───────────────────────────────────────────────────────────────────

export async function listTables(projectId: string) {
  if (!(await getProject(projectId))) throw new NotFoundException("Project not found");
  return await qall(getDb().select().from(datatableTables).where(eq(datatableTables.projectId, projectId)).orderBy(asc(datatableTables.name)));
}

/** All tables in a project with their columns — one round-trip for the schema canvas. */
export async function getProjectSchema(projectId: string) {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundException("Project not found");

  const tables = await listTables(projectId);
  if (tables.length === 0) {
    return { project, tables: [] as Array<DatatableTable & { columns: DatatableColumn[] }> };
  }

  const tableIds = tables.map((t) => t.id);
  const columns = await qall(getDb().select().from(datatableColumns).where(inArray(datatableColumns.tableId, tableIds)).orderBy(asc(datatableColumns.sortOrder), asc(datatableColumns.name)));

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

export async function getTable(id: string): Promise<DatatableTable | null> {
  return (await qone(getDb().select().from(datatableTables).where(eq(datatableTables.id, id)))) ?? null;
}

export async function getTableByNames(projectName: string, tableName: string): Promise<{ project: DatatableProject; table: DatatableTable } | null> {
  const project = await getProjectByName(projectName);
  if (!project) return null;
  const table =
    (await qone(
      getDb()
        .select()
        .from(datatableTables)
        .where(and(eq(datatableTables.projectId, project.id), eq(datatableTables.name, tableName))),
    )) ?? null;
  if (!table) return null;
  return { project, table };
}

/** Resolve project by id first, then by name (LLM may pass either after list_projects). */
export async function resolveProject(ref: string): Promise<DatatableProject | null> {
  const key = String(ref ?? "").trim();
  if (!key) return null;
  return (await getProject(key)) ?? (await getProjectByName(key));
}

/** Resolve table within a project by table id first, then by name. */
export async function resolveTableInProject(project: DatatableProject, tableRef: string): Promise<DatatableTable | null> {
  const key = String(tableRef ?? "").trim();
  if (!key) return null;
  const byId = await getTable(key);
  if (byId && byId.projectId === project.id) return byId;
  return (
    (await qone(
      getDb()
        .select()
        .from(datatableTables)
        .where(and(eq(datatableTables.projectId, project.id), eq(datatableTables.name, key))),
    )) ?? null
  );
}

/** Resolve project + table from refs that may be id or name. */
export async function resolveProjectAndTable(projectRef: string, tableRef: string): Promise<{ project: DatatableProject; table: DatatableTable } | null> {
  const project = await resolveProject(projectRef);
  if (!project) return null;
  const table = await resolveTableInProject(project, tableRef);
  if (!table) return null;
  return { project, table };
}

export async function createTable(projectId: string, body: { name: string }) {
  if (!(await getProject(projectId))) throw new NotFoundException("Project not found");
  const name = assertName(body.name, "name");
  const clash = await qone(
    getDb()
      .select()
      .from(datatableTables)
      .where(and(eq(datatableTables.projectId, projectId), eq(datatableTables.name, name))),
  );
  if (clash) throw new BadRequestException(`Table "${name}" already exists in this project`);
  const now = new Date();
  const entry: NewDatatableTable = { id: crypto.randomUUID(), projectId, name, createdAt: now, updatedAt: now };
  await qrun(getDb().insert(datatableTables).values(entry));
  wsHub.emit("datatables:table-created", entry);
  return entry;
}

export async function updateTable(id: string, body: { name?: string }) {
  const current = await getTable(id);
  if (!current) throw new NotFoundException("Table not found");
  const name = body.name !== undefined ? assertName(body.name, "name") : current.name;
  if (name !== current.name) {
    const clash = await qone(
      getDb()
        .select()
        .from(datatableTables)
        .where(and(eq(datatableTables.projectId, current.projectId), eq(datatableTables.name, name))),
    );
    if (clash) throw new BadRequestException(`Table "${name}" already exists in this project`);
  }
  const updatedAt = new Date();
  await qrun(getDb().update(datatableTables).set({ name, updatedAt }).where(eq(datatableTables.id, id)));
  const updated = (await getTable(id))!;
  wsHub.emit("datatables:table-updated", updated);
  return updated;
}

export async function deleteTable(id: string) {
  const current = await getTable(id);
  if (!current) throw new NotFoundException("Table not found");
  await qrun(getDb().delete(datatableTables).where(eq(datatableTables.id, id)));
  wsHub.emit("datatables:table-deleted", { id, projectId: current.projectId });
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export async function listColumns(tableId: string) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  return await qall(getDb().select().from(datatableColumns).where(eq(datatableColumns.tableId, tableId)).orderBy(asc(datatableColumns.sortOrder), asc(datatableColumns.name)));
}

export async function getColumn(id: string): Promise<DatatableColumn | null> {
  return (await qone(getDb().select().from(datatableColumns).where(eq(datatableColumns.id, id)))) ?? null;
}

/** Resolve column within a table by column id first, then by name. */
export async function resolveColumnInTable(tableId: string, columnRef: string): Promise<DatatableColumn | null> {
  const key = String(columnRef ?? "").trim();
  if (!key) return null;
  const byId = await getColumn(key);
  if (byId && byId.tableId === tableId) return byId;
  return (await listColumns(tableId)).find((c) => c.name === key) ?? null;
}

export async function getSchemaByNames(projectName: string, tableName: string) {
  const found = await getTableByNames(projectName, tableName);
  if (!found) throw new NotFoundException(`Table "${projectName}/${tableName}" not found`);
  return {
    project: found.project,
    table: found.table,
    columns: await listColumns(found.table.id),
  };
}

/** Schema for one table; project/table refs accept id or name. */
export async function getSchemaByRefs(projectRef: string, tableRef: string) {
  const found = await resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return {
    project: found.project,
    table: found.table,
    columns: await listColumns(found.table.id),
  };
}

/** Full project schema (all tables + columns); ref accepts id or name. */
export async function getProjectSchemaByRef(projectRef: string) {
  const project = await resolveProject(projectRef);
  if (!project) throw new NotFoundException(`Project "${projectRef}" not found`);
  return await getProjectSchema(project.id);
}

/** @deprecated prefer getProjectSchemaByRef */
export async function getProjectSchemaByName(projectName: string) {
  return await getProjectSchemaByRef(projectName);
}

export async function createColumn(tableId: string, body: { name: string; type: string; options?: string[] | null; required?: boolean; sortOrder?: number }) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  const name = assertColumnName(body.name ?? "");
  const type = assertColumnType(body.type);
  if (type === "select" && body.options !== undefined && body.options !== null && !Array.isArray(body.options)) {
    throw new BadRequestException("options must be a string array");
  }
  const clash = await qone(
    getDb()
      .select()
      .from(datatableColumns)
      .where(and(eq(datatableColumns.tableId, tableId), eq(datatableColumns.name, name))),
  );
  if (clash) throw new BadRequestException(`Column "${name}" already exists`);

  const existing = await listColumns(tableId);
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
  await qrun(getDb().insert(datatableColumns).values(entry));
  wsHub.emit("datatables:column-created", entry);
  return entry;
}

export async function updateColumn(id: string, body: { name?: string; type?: string; options?: string[] | null; required?: boolean; sortOrder?: number }) {
  const current = await getColumn(id);
  if (!current) throw new NotFoundException("Column not found");

  const name = body.name !== undefined ? assertColumnName(body.name) : current.name;
  if (name !== current.name) {
    const clash = await qone(
      getDb()
        .select()
        .from(datatableColumns)
        .where(and(eq(datatableColumns.tableId, current.tableId), eq(datatableColumns.name, name))),
    );
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

  await qrun(
    getDb()
      .update(datatableColumns)
      .set({
        name,
        type,
        options,
        required: body.required !== undefined ? Boolean(body.required) : current.required,
        sortOrder: body.sortOrder !== undefined ? body.sortOrder : current.sortOrder,
      })
      .where(eq(datatableColumns.id, id)),
  );

  if (name !== current.name) {
    await renameColumnNameInRows(current.tableId, current.name, name);
  }

  const updated = (await getColumn(id))!;
  wsHub.emit("datatables:column-updated", updated);
  return updated;
}

export async function reorderColumns(tableId: string, orderedIds: string[]) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  const cols = await listColumns(tableId);
  const idSet = new Set(cols.map((c) => c.id));
  if (orderedIds.length !== cols.length || orderedIds.some((id) => !idSet.has(id))) {
    throw new BadRequestException("orderedIds must include every column id exactly once");
  }
  const db = getDb();
  for (const [i, id] of orderedIds.entries()) {
    await qrun(db.update(datatableColumns).set({ sortOrder: i }).where(eq(datatableColumns.id, id)));
  }
  const updated = await listColumns(tableId);
  wsHub.emit("datatables:columns-reordered", { tableId, columns: updated });
  return updated;
}

export async function deleteColumn(id: string) {
  const current = await getColumn(id);
  if (!current) throw new NotFoundException("Column not found");
  await stripColumnNameFromRows(current.tableId, current.name);
  await qrun(getDb().delete(datatableColumns).where(eq(datatableColumns.id, id)));
  wsHub.emit("datatables:column-deleted", { id, tableId: current.tableId, name: current.name });
}

async function stripColumnNameFromRows(tableId: string, name: string) {
  const rows = await qall(getDb().select().from(datatableRows).where(eq(datatableRows.tableId, tableId)));
  const db = getDb();
  const now = new Date();
  for (const row of rows) {
    if (!(name in (row.data ?? {}))) continue;
    const data = { ...row.data };
    delete data[name];
    await qrun(db.update(datatableRows).set({ data, updatedAt: now }).where(eq(datatableRows.id, row.id)));
  }
}

async function renameColumnNameInRows(tableId: string, from: string, to: string) {
  const rows = await qall(getDb().select().from(datatableRows).where(eq(datatableRows.tableId, tableId)));
  const db = getDb();
  const now = new Date();
  for (const row of rows) {
    if (!(from in (row.data ?? {}))) continue;
    const data = { ...row.data };
    data[to] = data[from];
    delete data[from];
    await qrun(db.update(datatableRows).set({ data, updatedAt: now }).where(eq(datatableRows.id, row.id)));
  }
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

export async function queryRows(
  tableId: string,
  opts: {
    where?: WhereFilter;
    order_by?: OrderByItem[];
    limit?: number;
    offset?: number;
  } = {},
) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  const columns = await listColumns(tableId);
  const { sql: whereSql, params: whereParams } = buildWhereSql(opts.where, columns);
  const orderSql = buildOrderBySql(opts.order_by, columns);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const countParams = [tableId, ...whereParams];
  const countRows = await executeRaw<{ c: number }>(`SELECT COUNT(*) AS c FROM datatable_rows WHERE table_id = ?${whereSql}`, countParams);
  const countRow = countRows[0] ?? { c: 0 };
  const listParams = [tableId, ...whereParams, limit, offset];
  const items = await executeRaw<{
    id: string;
    tableId: string;
    data: string;
    createdAt: number;
    updatedAt: number;
  }>(
    `SELECT id, table_id AS tableId, data, created_at AS createdAt, updated_at AS updatedAt
       FROM datatable_rows WHERE table_id = ?${whereSql}${orderSql} LIMIT ? OFFSET ?`,
    listParams,
  );

  return {
    items: items.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
      createdAt: new Date(r.createdAt * 1000),
      updatedAt: new Date(r.updatedAt * 1000),
    })),
    total: Number(countRow.c),
    limit,
    offset,
  };
}

export async function getRow(id: string): Promise<DatatableRow | null> {
  return (await qone(getDb().select().from(datatableRows).where(eq(datatableRows.id, id)))) ?? null;
}

export async function insertRows(tableId: string, rows: Record<string, unknown>[]) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException("rows must be a non-empty array");
  if (rows.length > 200) throw new BadRequestException("Cannot insert more than 200 rows at once");
  const columns = await listColumns(tableId);
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
    await qrun(db.insert(datatableRows).values(entry));
    created.push((await getRow(entry.id as string)) ?? (entry as DatatableRow));
  }
  wsHub.emit("datatables:rows-created", { tableId, rows: created });
  return created;
}

export async function updateRow(id: string, data: Record<string, unknown>, partial = true) {
  const current = await getRow(id);
  if (!current) throw new NotFoundException("Row not found");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BadRequestException("data must be an object");
  }
  const columns = await listColumns(current.tableId);
  const patch = validateRowData(columns, data, partial);
  const next = partial ? { ...current.data, ...patch } : patch;
  for (const col of columns) {
    if (col.required && (next[col.name] === undefined || next[col.name] === null)) {
      throw new BadRequestException(`Column "${col.name}" is required`);
    }
  }
  const updatedAt = new Date();
  await qrun(getDb().update(datatableRows).set({ data: next, updatedAt }).where(eq(datatableRows.id, id)));
  const updated = (await getRow(id))!;
  wsHub.emit("datatables:row-updated", updated);
  return updated;
}

export async function deleteRow(id: string) {
  const current = await getRow(id);
  if (!current) throw new NotFoundException("Row not found");
  await qrun(getDb().delete(datatableRows).where(eq(datatableRows.id, id)));
  wsHub.emit("datatables:row-deleted", { id, tableId: current.tableId });
}

export async function bulkDeleteRows(tableId: string, rowIds: string[]) {
  if (!(await getTable(tableId))) throw new NotFoundException("Table not found");
  if (!Array.isArray(rowIds) || rowIds.length === 0) throw new BadRequestException("rowIds required");
  const db = getDb();
  let deleted = 0;
  for (const id of rowIds) {
    const row = await getRow(id);
    if (!row || row.tableId !== tableId) continue;
    await qrun(db.delete(datatableRows).where(eq(datatableRows.id, id)));
    deleted++;
  }
  wsHub.emit("datatables:rows-deleted", { tableId, rowIds, deleted });
  return { deleted };
}

// ─── Ref-based helpers (SDK / builtin) — project/table accept id or name ──────

export async function queryRowsByName(projectRef: string, tableRef: string, opts: { where?: WhereFilter; order_by?: OrderByItem[]; limit?: number; offset?: number } = {}) {
  const found = await resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return await queryRows(found.table.id, opts);
}

export async function insertRowsByName(projectRef: string, tableRef: string, rows: Record<string, unknown>[]) {
  const found = await resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return await insertRows(found.table.id, rows);
}

export async function updateRowByName(projectRef: string, tableRef: string, rowId: string, data: Record<string, unknown>) {
  const found = await resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  const row = await getRow(rowId);
  if (!row || row.tableId !== found.table.id) throw new NotFoundException("Row not found");
  return await updateRow(rowId, data, true);
}

export async function deleteRowsByName(projectRef: string, tableRef: string, rowIds: string[]) {
  const found = await resolveProjectAndTable(projectRef, tableRef);
  if (!found) throw new NotFoundException(`Table "${projectRef}/${tableRef}" not found`);
  return await bulkDeleteRows(found.table.id, rowIds);
}
