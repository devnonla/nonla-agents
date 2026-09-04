import { Hono } from "hono";
import type { User } from "../../common/db/client.js";
import { requireRole } from "../../common/middleware/auth.middleware.js";
import { type ApiKeyWriteBody, createApiKey, deleteApiKey, listApiKeys, revokeApiKey, updateApiKey } from "./api-keys.service.js";

const app = new Hono();

app.use("*", requireRole("admin"));

app.get("/", async (c) => c.json(await listApiKeys()));

app.post("/", async (c) => {
  const user = (c as any).get("user") as User;
  const body = await c.req.json<ApiKeyWriteBody & { name?: string }>();
  return c.json(await createApiKey({ ...body, name: body.name ?? "", createdBy: user.id }), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json<ApiKeyWriteBody>();
  return c.json(await updateApiKey(c.req.param("id"), body));
});

app.post("/:id/revoke", async (c) => c.json(await revokeApiKey(c.req.param("id"))));

app.delete("/:id", async (c) => {
  await deleteApiKey(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
