import { Hono } from "hono";
import { BadRequestException, ForbiddenException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { type ApiKeyContext, canAccessDatatable } from "../api-keys/api-keys.service.js";
import type { WhereFilter } from "../datatables/datatable-where.util.js";
import * as svc from "../datatables/datatables.service.js";
import { getApiKey } from "./api-key.middleware.js";

const app = new Hono();

async function requireProject(apiKey: ApiKeyContext, projectRef: string) {
  const project = await svc.resolveProject(projectRef);
  if (!project) throw new NotFoundException("Project not found");
  if (!canAccessDatatable(apiKey, project.id)) {
    throw new ForbiddenException("This API key cannot access that datatable");
  }
  return project;
}

async function requireTable(apiKey: ApiKeyContext, projectRef: string, tableRef: string) {
  const project = await requireProject(apiKey, projectRef);
  const table = await svc.resolveTableInProject(project, tableRef);
  if (!table) throw new NotFoundException("Table not found");
  return { project, table };
}

app.get("/", async (c) => {
  const apiKey = getApiKey(c);
  const all = await svc.listProjects();
  const items = apiKey.datatablesUnrestricted ? all : all.filter((project) => apiKey.datatableProjectIds.includes(project.id));
  return c.json({ items });
});

app.get("/:projectRef/schema", async (c) => {
  const project = await requireProject(getApiKey(c), c.req.param("projectRef"));
  return c.json(await svc.getProjectSchema(project.id));
});

app.post("/:projectRef/tables/:tableRef/query", async (c) => {
  const { table } = await requireTable(getApiKey(c), c.req.param("projectRef"), c.req.param("tableRef"));
  const body = await c.req.json<{
    where?: WhereFilter;
    order_by?: { key: string; dir?: "asc" | "desc" }[];
    limit?: number;
    offset?: number;
  }>();
  return c.json(await svc.queryRows(table.id, body));
});

app.post("/:projectRef/tables/:tableRef/rows", async (c) => {
  const { table } = await requireTable(getApiKey(c), c.req.param("projectRef"), c.req.param("tableRef"));
  const body = await c.req.json<{ rows?: Record<string, unknown>[] } | Record<string, unknown>[]>();
  const rows = Array.isArray(body) ? body : body.rows;
  return c.json(await svc.insertRows(table.id, rows ?? []), 201);
});

app.put("/:projectRef/tables/:tableRef/rows/:rowId", async (c) => {
  const { table } = await requireTable(getApiKey(c), c.req.param("projectRef"), c.req.param("tableRef"));
  const row = await svc.getRow(c.req.param("rowId"));
  if (!row || row.tableId !== table.id) throw new NotFoundException("Row not found");
  const body = await c.req.json<{ data?: Record<string, unknown> }>();
  return c.json(await svc.updateRow(row.id, body.data ?? body, true));
});

app.delete("/:projectRef/tables/:tableRef/rows", async (c) => {
  const { table } = await requireTable(getApiKey(c), c.req.param("projectRef"), c.req.param("tableRef"));
  const body = (await c.req.json().catch(() => ({}))) as { rowIds?: string[]; ids?: string[] };
  const rowIds = body.rowIds ?? body.ids ?? [];
  if (!Array.isArray(rowIds) || rowIds.length === 0) throw new BadRequestException("rowIds is required");
  return c.json(await svc.bulkDeleteRows(table.id, rowIds));
});

export default app;
