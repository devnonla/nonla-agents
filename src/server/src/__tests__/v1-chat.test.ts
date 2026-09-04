import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

function apiHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

describe("V1 Chat API", () => {
  let app: Hono;
  let cleanup: () => void;
  let adminToken: string;
  let allowedAgentId: string;
  let deniedAgentId: string;
  let rawKey: string;
  let revokedKey: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    adminToken = admin.token;

    const allowed = await authRequest(app, adminToken, "POST", "/api/agents", { name: "Allowed Agent" });
    allowedAgentId = ((await allowed.json()) as { id: string }).id;
    const denied = await authRequest(app, adminToken, "POST", "/api/agents", { name: "Denied Agent" });
    deniedAgentId = ((await denied.json()) as { id: string }).id;

    const keyRes = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Chat key",
      agentIds: [allowedAgentId],
    });
    rawKey = ((await keyRes.json()) as { key: string }).key;

    const revokedRes = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Revoked key",
      agentIds: [allowedAgentId],
    });
    const revoked = (await revokedRes.json()) as { id: string; key: string };
    revokedKey = revoked.key;
    await authRequest(app, adminToken, "POST", `/api/api-keys/${revoked.id}/revoke`);
  });

  afterAll(() => cleanup());

  test("GET /api/v1/agents — lists only agents on the key", async () => {
    const res = await app.request("/api/v1/agents", { headers: apiHeaders(rawKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string; name: string }[] };
    expect(data.items.map((a) => a.id)).toEqual([allowedAgentId]);
    expect(data.items[0]?.name).toBe("Allowed Agent");
    expect(Object.keys(data.items[0] ?? {}).sort()).toEqual(["avatar", "description", "id", "name"]);
  });

  test("GET /api/v1/agents — missing API key returns 401", async () => {
    const res = await app.request("/api/v1/agents");
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/chat — missing API key returns 401", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: allowedAgentId, message: "Hi" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/chat — revoked key returns 401", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(revokedKey),
      body: JSON.stringify({ agentId: allowedAgentId, message: "Hi" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/chat — agent outside ACL returns 403", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: deniedAgentId, message: "Hi" }),
    });
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/agents — unrestricted lists all agents", async () => {
    const created = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Open agents",
      agentsUnrestricted: true,
    });
    const openKey = ((await created.json()) as { key: string }).key;
    const res = await app.request("/api/v1/agents", { headers: apiHeaders(openKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string }[] };
    expect(data.items.map((a) => a.id).sort()).toEqual([allowedAgentId, deniedAgentId].sort());
  });

  test("POST /api/v1/chat — unrestricted can use any agent", async () => {
    const created = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Open chat",
      agentsUnrestricted: true,
    });
    const openKey = ((await created.json()) as { key: string }).key;
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(openKey),
      body: JSON.stringify({ agentId: deniedAgentId, message: "Hi", stream: false }),
    });
    expect(res.status).toBe(200);
  });

  test("POST /api/v1/chat — missing message returns 400", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: allowedAgentId }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/v1/chat — stream emits conversation then error without LLM", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: allowedAgentId, message: "Hello API" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"conversation"');
    expect(text).toContain("conversationId");
    expect(text).toContain("data:");
  });

  test("POST /api/v1/chat — one-shot returns JSON with conversationId", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: allowedAgentId, message: "One shot", stream: false }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { conversationId: string; content: string; status: string };
    expect(data.conversationId).toBeTruthy();
    expect(data.status).toBe("failed");
    expect(typeof data.content).toBe("string");
  });

  test("GET /api/conversations — does not list api trigger chats", async () => {
    const chatRes = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: allowedAgentId, message: "Hidden", stream: false }),
    });
    const chat = (await chatRes.json()) as { conversationId: string };
    const listRes = await authRequest(app, adminToken, "GET", "/api/conversations");
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.some((item) => item.id === chat.conversationId)).toBe(false);
  });

  test("POST /api/v1/chat/stop — missing conversationId returns 400", async () => {
    const res = await app.request("/api/v1/chat/stop", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/v1/chat/stop — foreign conversation returns 403", async () => {
    const res = await app.request("/api/v1/chat/stop", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ conversationId: crypto.randomUUID() }),
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/v1/chat/stop — owned conversation returns ok", async () => {
    const chatRes = await app.request("/api/v1/chat", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ agentId: allowedAgentId, message: "Stop me", stream: false }),
    });
    const chat = (await chatRes.json()) as { conversationId: string };
    const res = await app.request("/api/v1/chat/stop", {
      method: "POST",
      headers: apiHeaders(rawKey),
      body: JSON.stringify({ conversationId: chat.conversationId }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data).toHaveProperty("ok");
  });
});
