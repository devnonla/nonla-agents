import { Hono } from "hono";
import { BadRequestException, ForbiddenException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { type ApiKeyContext, canAccessKvEntry } from "../api-keys/api-keys.service.js";
import { createKvEntry, deleteKvByKey, getKvByKey, listKvEntries, updateKvEntry } from "../kvstore/kvstore.service.js";
import { getApiKey } from "./api-key.middleware.js";

const app = new Hono();

function toPublic(entry: { key: string; value: string; description?: string | null }) {
  return { key: entry.key, value: entry.value, description: entry.description ?? null };
}

async function requireKv(apiKey: ApiKeyContext, key: string) {
  const entry = await getKvByKey(key);
  if (!entry) throw new NotFoundException("KV entry not found");
  if (!canAccessKvEntry(apiKey, entry.id)) {
    throw new ForbiddenException("This API key cannot access that key");
  }
  return entry;
}

app.get("/", async (c) => {
  const apiKey = getApiKey(c);
  const all = (await listKvEntries({ sorts: "key" })).items;
  const items = apiKey.kvUnrestricted ? all : all.filter((entry) => apiKey.kvEntryIds.includes(entry.id));
  return c.json({ items: items.map(toPublic) });
});

app.get("/:key", async (c) => {
  return c.json(toPublic(await requireKv(getApiKey(c), c.req.param("key"))));
});

app.put("/:key", async (c) => {
  const apiKey = getApiKey(c);
  const key = c.req.param("key");
  const body = await c.req.json<{ value?: string; description?: string | null }>();
  if (typeof body.value !== "string") {
    throw new BadRequestException("value is required");
  }
  const existing = await getKvByKey(key);
  if (!existing) {
    if (!apiKey.kvUnrestricted) {
      throw new ForbiddenException("This API key cannot access that key");
    }
    return c.json(toPublic(await createKvEntry({ key, value: body.value, description: body.description })), 201);
  }
  if (!canAccessKvEntry(apiKey, existing.id)) {
    throw new ForbiddenException("This API key cannot access that key");
  }
  return c.json(
    toPublic(
      (await updateKvEntry(existing.id, {
        value: body.value,
        ...(body.description !== undefined ? { description: body.description } : {}),
      }))!,
    ),
  );
});

app.delete("/:key", async (c) => {
  await requireKv(getApiKey(c), c.req.param("key"));
  return c.json(await deleteKvByKey(c.req.param("key")));
});

export default app;
