import { Hono } from "hono";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { requireRole } from "../../common/middleware/auth.middleware.js";
import { createSecret, deleteSecret, getSecretMeta, listSecrets, updateSecret } from "./secrets.service.js";

const app = new Hono();

app.use("*", requireRole("admin"));

app.get("/", (c) => c.json(listSecrets(c.req.query())));

app.get("/:id", (c) => {
  const entry = getSecretMeta(c.req.param("id"));
  if (!entry) throw new BadRequestException("Secret not found");
  return c.json(entry);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createSecret(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateSecret(c.req.param("id"), body));
});

app.delete("/:id", (c) => {
  deleteSecret(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
