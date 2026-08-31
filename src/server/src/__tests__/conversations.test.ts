import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { bgTaskRegistry } from "../modules/tools/common/bg-task-registry.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Conversations API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let adminUserId: string;
  let agentId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
    adminUserId = admin.user.id as string;

    // Create an agent for conversations
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Conv Test Agent",
    });
    const agent = (await agentRes.json()) as { id: string };
    agentId = agent.id;
  });

  afterAll(() => cleanup());

  // ── CRUD ──────────────────────────────────────────────────────────────

  let convId = "";

  test("POST /api/conversations — create conversation", async () => {
    const res = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Test Chat",
      trigger: "manual",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.title).toBe("Test Chat");
    expect(data.agentId).toBe(agentId);
    expect(data.trigger).toBe("manual");
    expect(data.status).toBe("done");
    expect(data.ownerId).toBe(adminUserId);
    convId = data.id as string;
  });

  test("GET /api/conversations — list conversations (filter by agentId)", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations?agentId=${agentId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(data.items.length).toBeGreaterThanOrEqual(1);

    const conv = data.items.find((c) => c.id === convId);
    expect(conv).toBeTruthy();
    expect(conv!.title).toBe("Test Chat");
  });

  test("GET /api/conversations/:id — get single", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations/${convId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(convId);
  });

  test("GET /api/conversations/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/conversations/nonexistent");
    expect(res.status).toBe(400);
  });

  test("PUT /api/conversations/:id — update title", async () => {
    const res = await authRequest(app, token, "PUT", `/api/conversations/${convId}`, {
      title: "Updated Chat Title",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.title).toBe("Updated Chat Title");
  });

  // ── Messages ──────────────────────────────────────────────────────────

  test("POST /api/conversations/:id/messages — create message", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "user",
      content: "Hello, agent!",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.role).toBe("user");
    expect(data.content).toBe("Hello, agent!");
    expect(data.conversationId).toBe(convId);
  });

  test("POST /api/conversations/:id/messages — create assistant message", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "assistant",
      content: "Hello! How can I help you?",
    });

    expect(res.status).toBe(201);
  });

  test("GET /api/conversations/:id/messages — list messages", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations/${convId}/messages`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(2);
    expect(data[0].role).toBe("user");
    expect(data[1].role).toBe("assistant");
  });

  // ── Multiple conversations ────────────────────────────────────────────

  test("POST /api/conversations — create second conversation", async () => {
    const res = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Second Chat",
    });
    expect(res.status).toBe(201);
  });

  test("GET /api/conversations — lists multiple", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations?agentId=${agentId}`);
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items.length).toBe(2);
  });

  // ── Delete ────────────────────────────────────────────────────────────

  test("DELETE /api/conversations/:id — delete conversation", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/conversations/${convId}`);
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await authRequest(app, token, "GET", `/api/conversations/${convId}`);
    expect(getRes.status).toBe(400);
  });

  // ── Per-user isolation ────────────────────────────────────────────────

  test("conversations are isolated per user", async () => {
    // Admin creates a conversation
    const adminConvRes = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Admin Only Chat",
    });
    expect(adminConvRes.status).toBe(201);
    const adminConv = (await adminConvRes.json()) as { id: string };

    // Create member user and login
    await authRequest(app, token, "POST", "/api/users", {
      username: "convmember",
      name: "Conv Member",
      password: "memberpass1",
      role: "member",
    });
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "convmember", password: "memberpass1" }),
    });
    const { token: memberToken } = (await loginRes.json()) as { token: string };

    // Member creates their own conversation
    const memberConvRes = await authRequest(app, memberToken, "POST", "/api/conversations", {
      agentId,
      title: "Member Only Chat",
    });
    expect(memberConvRes.status).toBe(201);
    const memberConv = (await memberConvRes.json()) as { id: string; ownerId: string };
    expect(memberConv.ownerId).not.toBe(adminUserId);

    // Member list does not include admin's conversation
    const memberListRes = await authRequest(app, memberToken, "GET", `/api/conversations?agentId=${agentId}`);
    const memberList = (await memberListRes.json()) as { items: { id: string }[] };
    expect(memberList.items.some((c) => c.id === adminConv.id)).toBe(false);
    expect(memberList.items.some((c) => c.id === memberConv.id)).toBe(true);

    // Admin list does not include member's conversation
    const adminListRes = await authRequest(app, token, "GET", `/api/conversations?agentId=${agentId}`);
    const adminList = (await adminListRes.json()) as { items: { id: string }[] };
    expect(adminList.items.some((c) => c.id === memberConv.id)).toBe(false);
    expect(adminList.items.some((c) => c.id === adminConv.id)).toBe(true);

    // Member cannot get/update/delete admin's conversation
    expect((await authRequest(app, memberToken, "GET", `/api/conversations/${adminConv.id}`)).status).toBe(403);
    expect((await authRequest(app, memberToken, "PUT", `/api/conversations/${adminConv.id}`, { title: "Hacked" })).status).toBe(403);
    expect((await authRequest(app, memberToken, "DELETE", `/api/conversations/${adminConv.id}`)).status).toBe(403);
    expect((await authRequest(app, memberToken, "GET", `/api/conversations/${adminConv.id}/messages`)).status).toBe(403);
  });

  test("GET /api/conversations/:id/bg-tasks — empty list", async () => {
    const created = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Bg tasks chat",
    });
    const conv = (await created.json()) as { id: string };
    const res = await authRequest(app, token, "GET", `/api/conversations/${conv.id}/bg-tasks`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items).toEqual([]);
  });

  test("POST /api/conversations/:id/bg-tasks/:taskId/cancel — not found", async () => {
    const created = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Bg cancel missing",
    });
    const conv = (await created.json()) as { id: string };
    const res = await authRequest(app, token, "POST", `/api/conversations/${conv.id}/bg-tasks/missing/cancel`);
    expect(res.status).toBe(400);
  });

  test("GET/POST /api/conversations/:id/bg-tasks — list running then cancel", async () => {
    const created = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Bg cancel running",
    });
    const conv = (await created.json()) as { id: string };
    const taskId = bgTaskRegistry.register({
      toolId: "tool-1",
      toolName: "slow_tool",
      conversationId: conv.id,
      kill: () => {},
    });
    try {
      const listRes = await authRequest(app, token, "GET", `/api/conversations/${conv.id}/bg-tasks`);
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as { items: { taskId: string; toolName: string }[] };
      expect(list.items.some((t) => t.taskId === taskId && t.toolName === "slow_tool")).toBe(true);

      const cancelRes = await authRequest(app, token, "POST", `/api/conversations/${conv.id}/bg-tasks/${taskId}/cancel`, {});
      expect(cancelRes.status).toBe(200);
      const cancelled = (await cancelRes.json()) as { status: string; taskId: string };
      expect(cancelled.taskId).toBe(taskId);
      expect(cancelled.status).toBe("cancelled");

      const after = await authRequest(app, token, "GET", `/api/conversations/${conv.id}/bg-tasks`);
      const afterData = (await after.json()) as { items: { taskId: string }[] };
      expect(afterData.items.some((t) => t.taskId === taskId)).toBe(false);
    } finally {
      bgTaskRegistry._reset();
    }
  });

  test("GET /api/conversations/:id/bg-tasks/:taskId — returns console", async () => {
    const created = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Bg task detail",
    });
    const conv = (await created.json()) as { id: string };
    const taskId = bgTaskRegistry.register({
      toolId: "tool-1",
      toolName: "slow_tool",
      conversationId: conv.id,
      kill: () => {},
    });
    bgTaskRegistry.appendLog(taskId, "hello from tool\n");
    try {
      const res = await authRequest(app, token, "GET", `/api/conversations/${conv.id}/bg-tasks/${taskId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { taskId: string; console?: string; status: string };
      expect(data.taskId).toBe(taskId);
      expect(data.status).toBe("running");
      expect(data.console).toContain("hello from tool");
    } finally {
      bgTaskRegistry._reset();
    }
  });

  test("GET /api/conversations/:id/bg-tasks/:taskId — expired when missing", async () => {
    const created = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "Bg task missing",
    });
    const conv = (await created.json()) as { id: string };
    const res = await authRequest(app, token, "GET", `/api/conversations/${conv.id}/bg-tasks/missing`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { taskId: string; status: string };
    expect(data.taskId).toBe("missing");
    expect(data.status).toBe("expired");
  });
});
