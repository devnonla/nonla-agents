import { Hono } from "hono";
import { createToolFolder, deleteToolFolder, listToolFolders, reorderToolFolders, updateToolFolder } from "./tool-folders.service.js";

const app = new Hono();

// GET /api/tool-folders?page=1&limit=50&sorts=-createdAt
app.get("/", (c) => {
  return c.json(listToolFolders(c.req.query()));
});

// POST /api/tool-folders
app.post("/", async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  return c.json(createToolFolder(body), 201);
});

// PUT /api/tool-folders/reorder
app.put("/reorder", async (c) => {
  const body = await c.req.json<{ folderIds: string[] }>();
  return c.json(reorderToolFolders(body.folderIds ?? []));
});

// PUT /api/tool-folders/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateToolFolder(c.req.param("id"), body));
});

// DELETE /api/tool-folders/:id
app.delete("/:id", (c) => {
  deleteToolFolder(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
