import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import type { WhereFilter } from "./datatable-where.util.js";
import * as svc from "./datatables.service.js";
import { type DatatableAgentStreamRequest, streamDatatableAgent } from "./services/datatable-agent.service.js";

const app = new Hono();

app.use("*", requireAuth);

// ─── Projects ─────────────────────────────────────────────────────────────────

app.get("/projects", (c) => c.json(svc.listProjects()));

app.post("/projects", async (c) => {
  const body = await c.req.json();
  return c.json(svc.createProject(body), 201);
});

app.get("/projects/:projectId", (c) => {
  const project = svc.getProject(c.req.param("projectId"));
  if (!project) throw new NotFoundException("Project not found");
  return c.json(project);
});

app.put("/projects/:projectId", async (c) => {
  const body = await c.req.json();
  return c.json(svc.updateProject(c.req.param("projectId"), body));
});

app.delete("/projects/:projectId", (c) => {
  svc.deleteProject(c.req.param("projectId"));
  return c.json({ ok: true });
});

// ─── Tables ───────────────────────────────────────────────────────────────────

app.get("/projects/:projectId/tables", (c) => c.json(svc.listTables(c.req.param("projectId"))));

app.get("/projects/:projectId/schema", (c) => c.json(svc.getProjectSchema(c.req.param("projectId"))));

app.post("/projects/:projectId/agent/stream", async (c) => {
  const projectId = c.req.param("projectId");
  if (!svc.getProject(projectId)) throw new NotFoundException("Project not found");
  const body = await c.req.json<DatatableAgentStreamRequest>();
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    await streamDatatableAgent(projectId, body, stream, abort.signal);
  });
});

app.post("/projects/:projectId/tables", async (c) => {
  const body = await c.req.json();
  return c.json(svc.createTable(c.req.param("projectId"), body), 201);
});

app.get("/tables/:tableId", (c) => {
  const table = svc.getTable(c.req.param("tableId"));
  if (!table) throw new NotFoundException("Table not found");
  return c.json(table);
});

app.put("/tables/:tableId", async (c) => {
  const body = await c.req.json();
  return c.json(svc.updateTable(c.req.param("tableId"), body));
});

app.delete("/tables/:tableId", (c) => {
  svc.deleteTable(c.req.param("tableId"));
  return c.json({ ok: true });
});

// ─── Columns ──────────────────────────────────────────────────────────────────

app.get("/tables/:tableId/columns", (c) => c.json(svc.listColumns(c.req.param("tableId"))));

app.post("/tables/:tableId/columns", async (c) => {
  const body = await c.req.json();
  return c.json(svc.createColumn(c.req.param("tableId"), body), 201);
});

app.put("/columns/:columnId", async (c) => {
  const body = await c.req.json();
  return c.json(svc.updateColumn(c.req.param("columnId"), body));
});

app.post("/tables/:tableId/columns/reorder", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body.orderedIds)) throw new BadRequestException("orderedIds required");
  return c.json(svc.reorderColumns(c.req.param("tableId"), body.orderedIds));
});

app.delete("/columns/:columnId", (c) => {
  svc.deleteColumn(c.req.param("columnId"));
  return c.json({ ok: true });
});

// ─── Rows ─────────────────────────────────────────────────────────────────────

app.get("/tables/:tableId/rows", async (c) => {
  const q = c.req.query();
  let where: WhereFilter | undefined;
  let order_by: { key: string; dir?: "asc" | "desc" }[] | undefined;
  if (q.where) {
    try {
      where = JSON.parse(q.where);
    } catch {
      throw new BadRequestException("where must be valid JSON");
    }
  }
  if (q.order_by) {
    try {
      order_by = JSON.parse(q.order_by);
    } catch {
      throw new BadRequestException("order_by must be valid JSON");
    }
  }
  return c.json(
    svc.queryRows(c.req.param("tableId"), {
      where,
      order_by,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }),
  );
});

app.post("/tables/:tableId/rows/query", async (c) => {
  const body = await c.req.json();
  return c.json(
    svc.queryRows(c.req.param("tableId"), {
      where: body.where,
      order_by: body.order_by,
      limit: body.limit,
      offset: body.offset,
    }),
  );
});

app.post("/tables/:tableId/rows", async (c) => {
  const body = await c.req.json();
  const rows = Array.isArray(body) ? body : body.rows;
  return c.json(svc.insertRows(c.req.param("tableId"), rows), 201);
});

app.put("/rows/:rowId", async (c) => {
  const body = await c.req.json();
  const data = body.data ?? body;
  return c.json(svc.updateRow(c.req.param("rowId"), data, true));
});

app.delete("/rows/:rowId", (c) => {
  svc.deleteRow(c.req.param("rowId"));
  return c.json({ ok: true });
});

app.post("/tables/:tableId/rows/bulk-delete", async (c) => {
  const body = await c.req.json();
  return c.json(svc.bulkDeleteRows(c.req.param("tableId"), body.rowIds ?? body.ids ?? []));
});

export default app;
