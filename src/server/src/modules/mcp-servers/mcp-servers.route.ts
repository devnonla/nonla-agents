import { Hono } from "hono";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { createMcpServer, deleteMcpServer, getMcpServer, listMcpServers, syncMcpTools, updateMcpServer } from "./mcp-servers.service.js";

const app = new Hono();

// GET /api/mcp-servers
app.get("/", (c) => {
  return c.json(listMcpServers(c.req.query()));
});

// GET /api/mcp-servers/:id
app.get("/:id", (c) => {
  const server = getMcpServer(c.req.param("id"));
  if (!server) throw new BadRequestException("MCP server not found");
  return c.json(server);
});

// POST /api/mcp-servers
app.post("/", async (c) => {
  const body = await c.req.json();
  let server: Awaited<ReturnType<typeof createMcpServer>>;
  try {
    server = await createMcpServer(body);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : String(err));
  }

  // Auto-sync tools after creation
  try {
    const syncResult = await syncMcpTools(server.id!);
    const refreshed = getMcpServer(server.id!);
    return c.json({ ...(refreshed ?? server), syncResult }, 201);
  } catch (err) {
    // Server created but sync failed — return server with persisted error
    const refreshed = getMcpServer(server.id!);
    return c.json(
      {
        ...(refreshed ?? server),
        syncResult: { error: err instanceof Error ? err.message : String(err), added: 0, updated: 0, removed: 0, tools: [] },
      },
      201,
    );
  }
});

// PUT /api/mcp-servers/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  try {
    const updated = await updateMcpServer(c.req.param("id"), body);
    if (!updated) throw new BadRequestException("MCP server not found");
    return c.json(updated);
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException(err instanceof Error ? err.message : String(err));
  }
});

// DELETE /api/mcp-servers/:id
app.delete("/:id", async (c) => {
  await deleteMcpServer(c.req.param("id"));
  return c.json({ ok: true });
});

// POST /api/mcp-servers/:id/sync — re-discover and sync tools
app.post("/:id/sync", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await syncMcpTools(id);
    return c.json(result);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : String(err));
  }
});

export default app;
