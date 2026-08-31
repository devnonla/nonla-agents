import { Hono } from "hono";
import { createMyMcpServer, deleteMyMcpServer, getMyMcpServer, listMyMcpServers, rotateMyMcpServerKey, updateMyMcpServer } from "./my-mcp-servers.service.js";

const app = new Hono();

app.get("/", (c) => c.json(listMyMcpServers(c.req.query())));

app.get("/:id", (c) => c.json(getMyMcpServer(c.req.param("id"))));

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createMyMcpServer(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateMyMcpServer(c.req.param("id"), body));
});

app.post("/:id/rotate-key", (c) => c.json(rotateMyMcpServerKey(c.req.param("id"))));

app.delete("/:id", (c) => {
  deleteMyMcpServer(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
