import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("LLM Providers API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  let providerId = "";

  test("GET /api/providers — empty list initially", async () => {
    const res = await authRequest(app, token, "GET", "/api/providers");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: unknown[]; total: number };
    expect(data.items.length).toBe(0);
    expect(data.total).toBe(0);
  });

  test("Directly create a provider via service (bypass fetchModels)", async () => {
    const { createProvider, getProvider, decryptProviderApiKey } = await import("../modules/llm-providers/llm-providers.service.js");
    const provider = createProvider({
      provider: "openai",
      label: "My OpenAI",
      apiKey: "sk-test-key-12345",
      customBaseUrl: "",
      models: ["gpt-4", "gpt-3.5-turbo"],
    });

    expect(provider.id).toBeTruthy();
    expect(provider.label).toBe("My OpenAI");
    // Stored ciphertext — not plaintext
    expect(provider.apiKey).not.toBe("sk-test-key-12345");
    expect(provider.apiKey.startsWith("v1:")).toBe(true);
    expect(decryptProviderApiKey(provider.apiKey)).toBe("sk-test-key-12345");

    const row = getProvider(provider.id);
    expect(row?.apiKey).not.toBe("sk-test-key-12345");
    providerId = provider.id;
  });

  test("GET /api/providers — list includes created provider", async () => {
    const res = await authRequest(app, token, "GET", "/api/providers");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(1);

    const item = data.items[0];
    expect(item.label).toBe("My OpenAI");
    expect(item.provider).toBe("openai");
    expect(item.countModels).toBe(2);
    expect(item.hasApiKey).toBe(true);
    expect(item.maskedApiKey).toBe("••••••••");
    expect(item).not.toHaveProperty("apiKey");
  });

  test("GET /api/providers/:id — public detail never returns apiKey", async () => {
    const res = await authRequest(app, token, "GET", `/api/providers/${providerId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(providerId);
    expect(data).not.toHaveProperty("apiKey");
    expect(data.hasApiKey).toBe(true);
    expect(data.maskedApiKey).toBe("••••••••");
    expect(data.models).toEqual(["gpt-4", "gpt-3.5-turbo"]);
  });

  test("GET /api/providers/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/providers/nonexistent");
    expect(res.status).toBe(400);
  });

  test("GET /api/providers/:id/models — get models list", async () => {
    const res = await authRequest(app, token, "GET", `/api/providers/${providerId}/models`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as string[];
    expect(data).toEqual(["gpt-4", "gpt-3.5-turbo"]);
  });

  test("PUT /api/providers/:id — update label keeps key; blank apiKey does not wipe", async () => {
    const { getProvider, decryptProviderApiKey } = await import("../modules/llm-providers/llm-providers.service.js");

    const res = await authRequest(app, token, "PUT", `/api/providers/${providerId}`, {
      label: "Updated OpenAI",
      apiKey: "",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.label).toBe("Updated OpenAI");
    expect(data).not.toHaveProperty("apiKey");
    expect(data.hasApiKey).toBe(true);

    const row = getProvider(providerId);
    expect(decryptProviderApiKey(row?.apiKey)).toBe("sk-test-key-12345");
  });

  test("PUT /api/providers/:id — rotate apiKey encrypts new value", async () => {
    const { getProvider, decryptProviderApiKey } = await import("../modules/llm-providers/llm-providers.service.js");

    const res = await authRequest(app, token, "PUT", `/api/providers/${providerId}`, {
      apiKey: "sk-rotated-key-99999",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).not.toHaveProperty("apiKey");

    const row = getProvider(providerId);
    expect(row?.apiKey.startsWith("v1:")).toBe(true);
    expect(decryptProviderApiKey(row?.apiKey)).toBe("sk-rotated-key-99999");
  });

  test("getProviderForUse decrypts for backend use", async () => {
    const { getProviderForUse } = await import("../modules/llm-providers/llm-providers.service.js");
    const forUse = getProviderForUse(providerId);
    expect(forUse?.apiKey).toBe("sk-rotated-key-99999");
  });

  test("DELETE /api/providers/:id — delete provider", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/providers/${providerId}`);
    expect(res.status).toBe(200);

    const getRes = await authRequest(app, token, "GET", `/api/providers/${providerId}`);
    expect(getRes.status).toBe(400);
  });
});
