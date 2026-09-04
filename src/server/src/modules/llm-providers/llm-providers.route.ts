import { Hono } from "hono";
import { llmProviders } from "../../common/db/client.js";
import { listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { fetchModelsForProvider } from "./fetchModels.js";
import { createProvider, deleteProvider, getProvider, getProviderForUse, toProviderPublic, updateProvider } from "./llm-providers.service.js";

const app = new Hono();

// GET /api/providers?page=1&limit=50&sorts=-createdAt
app.get("/", async (c) => {
  const result = await listQuery({ table: llmProviders }, c.req.query());
  return c.json({
    ...result,
    items: result.items.map((row) => {
      const pub = toProviderPublic(row as Parameters<typeof toProviderPublic>[0]);
      return {
        id: pub.id,
        label: pub.label,
        provider: pub.provider,
        countModels: pub.models.length,
        hasApiKey: pub.hasApiKey,
        maskedApiKey: pub.maskedApiKey,
      };
    }),
  });
});

// GET /api/providers/:id/models → models list for a single provider
app.get("/:id/models", async (c) => {
  const row = await getProvider(c.req.param("id"));
  if (!row) throw new BadRequestException("Provider not found");
  return c.json(row.models ?? []);
});

// GET /api/providers/:id → public detail (apiKey never returned)
app.get("/:id", async (c) => {
  const row = await getProvider(c.req.param("id"));
  if (!row) throw new BadRequestException("Provider not found");
  return c.json(toProviderPublic(row));
});

// POST /api/providers
app.post("/", async (c) => {
  const body = await c.req.json();
  const { provider, apiKey = "", customBaseUrl = "" } = body;

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new BadRequestException("API key is required");
  }

  try {
    const models = await fetchModelsForProvider({ provider, apiKey, customBaseUrl });
    if (models.length === 0 && provider !== "anthropic") {
      throw new BadRequestException("No models found. Check your API key and Base URL.");
    }
    const row = await createProvider({ ...body, apiKey: apiKey.trim(), models });
    return c.json(toProviderPublic(row!), 201);
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Could not connect to provider: ${msg}`);
  }
});

// PUT /api/providers/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  const patch: Record<string, unknown> = { ...body };
  // Write-only: blank apiKey means keep existing.
  if (typeof patch.apiKey === "string" && patch.apiKey.trim() === "") {
    delete patch.apiKey;
  } else if (typeof patch.apiKey === "string") {
    patch.apiKey = patch.apiKey.trim();
  }
  const updated = await updateProvider(c.req.param("id"), patch);
  return c.json(toProviderPublic(updated));
});

// POST /api/providers/:id/refresh-models
app.post("/:id/refresh-models", async (c) => {
  const id = c.req.param("id");
  const existing = await getProviderForUse(id);
  if (!existing) throw new BadRequestException("Provider not found");

  try {
    const models = await fetchModelsForProvider({
      provider: existing.provider,
      apiKey: existing.apiKey,
      customBaseUrl: existing.customBaseUrl,
    });
    const updated = await updateProvider(id, { models });
    return c.json(toProviderPublic(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Failed to fetch models: ${msg}`);
  }
});

// DELETE /api/providers/:id
app.delete("/:id", async (c) => {
  await deleteProvider(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
