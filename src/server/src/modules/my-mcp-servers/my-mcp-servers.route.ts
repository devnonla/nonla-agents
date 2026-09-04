import { Hono } from "hono";
import { createMyMcpServer, deleteMyMcpServer, getMyMcpServer, listMyMcpServers, rotateMyMcpServerKey, updateMyMcpServer } from "./my-mcp-servers.service.js";

const app = new Hono();

app.get("/", async (c) => c.json(await listMyMcpServers(c.req.query())));

app.get("/:id", async (c) => c.json(await getMyMcpServer(c.req.param("id"))));

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(await createMyMcpServer(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(await updateMyMcpServer(c.req.param("id"), body));
});

app.post("/:id/rotate-key", async (c) => c.json(await rotateMyMcpServerKey(c.req.param("id"))));

app.delete("/:id", async (c) => {
  await deleteMyMcpServer(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
