import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type CodingStreamRequest, streamCodingAgent } from "./services/coding-agent.service.js";
import { createTool, deleteTool, getTool, listTools, reorderTools, updateTool } from "./tools.service.js";

const app = new Hono();

// GET /api/tools?page=1&limit=50&sorts=-createdAt
app.get("/", (c) => {
  return c.json(listTools(c.req.query()));
});

// PUT /api/tools/reorder — persist kanban order within a folder (or ungrouped)
app.put("/reorder", async (c) => {
  const body = await c.req.json<{ folderId?: string | null; toolIds?: string[] }>();
  return c.json(reorderTools(body.folderId ?? null, body.toolIds ?? []));
});

// POST /api/tools/:id/coding/stream — coding agent SSE
app.post("/:id/coding/stream", async (c) => {
  const toolId = c.req.param("id");
  const body = await c.req.json<CodingStreamRequest>();

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();

    // When client disconnects (stop button, page close, navigation), abort the agent
    stream.onAbort(() => {
      abort.abort();
    });

    await streamCodingAgent(toolId, body, stream, abort.signal);
  });
});

// GET /api/tools/:id
app.get("/:id", (c) => {
  const row = getTool(c.req.param("id"));
  if (!row) throw new BadRequestException("Not found");
  return c.json(row);
});

// POST /api/tools
app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createTool(body), 201);
});

// PUT /api/tools/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateTool(c.req.param("id"), body));
});

// DELETE /api/tools/:id
app.delete("/:id", (c) => {
  deleteTool(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
