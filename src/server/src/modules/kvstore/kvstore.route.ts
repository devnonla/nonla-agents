import { Hono } from "hono";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { createKvEntry, deleteKvEntry, getKvEntry, listKvEntries, updateKvEntry } from "./kvstore.service.js";

const app = new Hono();

/** KV store — any authenticated user (admin + member) */
app.use("*", requireAuth);

app.get("/", async (c) => c.json(await listKvEntries(c.req.query())));

app.get("/:id", async (c) => {
  const entry = await getKvEntry(c.req.param("id"));
  if (!entry) throw new BadRequestException("KV entry not found");
  return c.json(entry);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(await createKvEntry(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(await updateKvEntry(c.req.param("id"), body));
});

app.delete("/:id", async (c) => {
  await deleteKvEntry(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
