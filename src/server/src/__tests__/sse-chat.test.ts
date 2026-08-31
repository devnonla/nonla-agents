import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import type { AgentStreamEvent } from "../modules/agents/runtime/utils/agentRunner.js";
import { runRegistry } from "../modules/agents/runtime/utils/run-registry.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("SSE Chat & Streaming API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let agentId: string;
  let convId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;

    // Create agent
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "SSE Test Agent",
      systemPrompt: "You are a test bot.",
    });
    const agent = (await agentRes.json()) as { id: string };
    agentId = agent.id;

    // Create conversation
    const convRes = await authRequest(app, token, "POST", "/api/conversations", {
      agentId,
      title: "SSE Test Chat",
    });
    const conv = (await convRes.json()) as { id: string };
    convId = conv.id;
  });

  afterAll(() => cleanup());

  // ═══════════════════════════════════════════════════════════════════════
  // SSE Chat — Validation
  // ═══════════════════════════════════════════════════════════════════════

  test("POST /:id/chat — missing message returns SSE error", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/chat`, { agentId });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain("required");
  });

  test("POST /:id/chat — missing agentId returns SSE error", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/chat`, { message: "Hello" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"error"');
  });

  test("POST /:id/chat — empty message returns SSE error", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/chat`, { agentId, message: "" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"error"');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SSE Chat — No LLM Provider
  // ═══════════════════════════════════════════════════════════════════════

  test("POST /:id/chat — no LLM → error event + user message saved", async () => {
    const res = await authRequest(app, token, "POST", `/api/conversations/${convId}/chat`, {
      agentId,
      message: "Hello, agent!",
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data:");

    // User message should be saved
    const msgsRes = await authRequest(app, token, "GET", `/api/conversations/${convId}/messages`);
    const msgs = (await msgsRes.json()) as { role: string; content: string }[];
    const userMsg = msgs.find((m) => m.role === "user" && m.content === "Hello, agent!");
    expect(userMsg).toBeTruthy();
  });

  test("POST /:id/chat — conversation status updated after failed chat", async () => {
    const res = await authRequest(app, token, "GET", `/api/conversations/${convId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(["failed", "done"]).toContain(data.status);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // runRegistry — background run + replay (F5-resilient)
  // ═══════════════════════════════════════════════════════════════════════

  test("runRegistry — late subscriber gets structural replay + live text snapshot", () => {
    const id = `replay-${crypto.randomUUID()}`;
    const { runId } = runRegistry.create(id, agentId);
    runRegistry.emit(id, { type: "text-delta", text: "Hello" }, runId);
    runRegistry.emit(id, { type: "text-delta", text: " world" }, runId);

    // Text deltas are snapshotted (not individually buffered) to avoid F5 dup with DB
    const received: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => received.push(e));
    expect(received).toEqual([{ type: "text-delta", text: "Hello world" }]);

    runRegistry.emit(id, { type: "tool-call", toolCallId: "t1", toolName: "search", toolLabel: "Search", input: {} }, runId);
    expect(received.at(-1)?.type).toBe("tool-call");

    // After tool-call, live text is cleared; new text accumulates again
    runRegistry.emit(id, { type: "text-delta", text: "Result" }, runId);
    runRegistry.emit(id, { type: "done", text: "Result" }, runId);
    expect(received.at(-1)).toEqual({ type: "done", text: "Result" });

    runRegistry.finish(id, runId);
    const late: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => late.push(e));
    // Structural only: tool-call + done (live text cleared on done)
    expect(late.map((e) => e.type)).toEqual(["tool-call", "done"]);
  });

  test("runRegistry — superseded emit is ignored; create unblocks old relays", () => {
    const id = `super-${crypto.randomUUID()}`;
    const first = runRegistry.create(id, agentId);
    const oldEvents: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => oldEvents.push(e));

    const second = runRegistry.create(id, agentId);
    expect(oldEvents.at(-1)).toEqual({ type: "error", error: "cancelled" });

    // Old runId must not pollute the new buffer
    runRegistry.emit(id, { type: "text-delta", text: "stale" }, first.runId);
    const fresh: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => fresh.push(e));
    expect(fresh).toEqual([]);

    runRegistry.emit(id, { type: "done", text: "ok" }, second.runId);
    runRegistry.finish(id, second.runId);
  });

  test("runRegistry — cancel emits cancelled terminal and finishes run", () => {
    const id = `cancel-${crypto.randomUUID()}`;
    runRegistry.create(id, agentId);
    const received: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => received.push(e));

    expect(runRegistry.isActive(id)).toBe(true);
    expect(runRegistry.cancel(id)).toBe(true);
    expect(received.at(-1)).toEqual({ type: "error", error: "cancelled" });
    expect(runRegistry.isActive(id)).toBe(false);
    // Still in grace window for replay
    expect(runRegistry.has(id)).toBe(true);
    expect(runRegistry.cancel(id)).toBe(false);

    // Late subscriber gets cancellation via buffer
    const late: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => late.push(e));
    expect(late.some((e) => e.type === "error" && (e as { error: string }).error === "cancelled")).toBe(true);
  });

  test("runRegistry — stall emits error and finishes", () => {
    const id = `stall-${crypto.randomUUID()}`;
    const { runId } = runRegistry.create(id, agentId);
    const received: AgentStreamEvent[] = [];
    runRegistry.subscribe(id, (e) => received.push(e));

    expect(runRegistry.stall(id, runId, "Stream stalled (no activity)")).toBe(true);
    expect(received.at(-1)).toEqual({ type: "error", error: "Stream stalled (no activity)" });
    expect(runRegistry.isActive(id)).toBe(false);
    expect(runRegistry.stall(id, runId)).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Stop Stream
  // ═══════════════════════════════════════════════════════════════════════

  test("POST /chat/stop — non-existent stream returns ok:false", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/chat/stop`, {
      conversationId: "non-existent-conv",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(false);
  });

  test("POST /chat/stop — missing conversationId returns 400", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/chat/stop`, {});
    expect(res.status).toBe(400);
  });

  test("POST /chat/stop — valid conv but no active run returns ok:false", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/chat/stop`, { conversationId: convId });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Message Feed — GET /api/conversations/feed/messages
  // ═══════════════════════════════════════════════════════════════════════

  test("feed/messages — requires agentId", async () => {
    const res = await authRequest(app, token, "GET", "/api/conversations/feed/messages");
    expect(res.status).toBe(400);
  });

  test("feed/messages — empty for agent with no messages", async () => {
    const agentRes = await authRequest(app, token, "POST", "/api/agents", { name: "Empty Agent" });
    const emptyAgent = (await agentRes.json()) as { id: string };

    const res = await authRequest(app, token, "GET", `/api/conversations/feed/messages?agentId=${emptyAgent.id}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: unknown[]; hasMore: boolean };
    expect(data.items.length).toBe(0);
    expect(data.hasMore).toBe(false);
  });

  test("feed/messages — returns messages with conv enrichment", async () => {
    const conv2Res = await authRequest(app, token, "POST", "/api/conversations", { agentId, title: "Feed Chat" });
    const conv2 = (await conv2Res.json()) as { id: string };

    await authRequest(app, token, "POST", `/api/conversations/${conv2.id}/messages`, { agentId, role: "user", content: "Feed msg 1" });
    await authRequest(app, token, "POST", `/api/conversations/${conv2.id}/messages`, { agentId, role: "assistant", content: "Feed reply 1" });

    const res = await authRequest(app, token, "GET", `/api/conversations/feed/messages?agentId=${agentId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; hasMore: boolean };
    expect(data.items.length).toBeGreaterThanOrEqual(2);

    const item = data.items[0];
    expect(item).toHaveProperty("convTitle");
    expect(item).toHaveProperty("convTrigger");
    expect(item).toHaveProperty("convCreatedAt");
  });

  test("feed/messages — cursor pagination", async () => {
    const page1Res = await authRequest(app, token, "GET", `/api/conversations/feed/messages?agentId=${agentId}`);
    const page1 = (await page1Res.json()) as { items: { createdAt: string }[]; hasMore: boolean };

    if (page1.items.length > 0) {
      const cursor = page1.items[0].createdAt;
      const page2Res = await authRequest(app, token, "GET", `/api/conversations/feed/messages?agentId=${agentId}&cursor=${cursor}`);
      expect(page2Res.status).toBe(200);
      const page2 = (await page2Res.json()) as { items: unknown[]; hasMore: boolean };
      expect(typeof page2.hasMore).toBe("boolean");
    }
  });

  test("feed/messages — filters out empty tool messages", async () => {
    const conv3Res = await authRequest(app, token, "POST", "/api/conversations", { agentId, title: "Filter Test" });
    const conv3 = (await conv3Res.json()) as { id: string };

    await authRequest(app, token, "POST", `/api/conversations/${conv3.id}/messages`, { agentId, role: "tool", content: "" });
    await authRequest(app, token, "POST", `/api/conversations/${conv3.id}/messages`, { agentId, role: "user", content: "Real message" });

    const msgsRes = await authRequest(app, token, "GET", `/api/conversations/${conv3.id}/messages`);
    const msgs = (await msgsRes.json()) as { role: string; content: string }[];

    const emptyToolMsgs = msgs.filter((m) => m.role === "tool" && m.content === "");
    expect(emptyToolMsgs.length).toBe(0);

    const realMsgs = msgs.filter((m) => m.content === "Real message");
    expect(realMsgs.length).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Message Metadata Patch
  // ═══════════════════════════════════════════════════════════════════════

  test("PATCH metadata — basic patch", async () => {
    const createRes = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "tool",
      content: "some_tool",
      metadata: { toolName: "some_tool" },
    });
    const msg = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PATCH", `/api/conversations/${convId}/messages/${msg.id}/metadata`, {
      toolOutput: '{"result": "success"}',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("PATCH metadata — merges with existing (preserves old keys)", async () => {
    const createRes = await authRequest(app, token, "POST", `/api/conversations/${convId}/messages`, {
      agentId,
      role: "tool",
      content: "merge_tool",
      metadata: { toolName: "merge_tool", toolCallId: "tc-1" },
    });
    const msg = (await createRes.json()) as { id: string };

    // First patch
    await authRequest(app, token, "PATCH", `/api/conversations/${convId}/messages/${msg.id}/metadata`, { toolOutput: "output1" });

    // Second patch — should merge
    await authRequest(app, token, "PATCH", `/api/conversations/${convId}/messages/${msg.id}/metadata`, { toolError: true });

    // Verify all metadata preserved
    const msgsRes = await authRequest(app, token, "GET", `/api/conversations/${convId}/messages`);
    const msgs = (await msgsRes.json()) as { id: string; metadata: Record<string, unknown> }[];
    const patched = msgs.find((m) => m.id === msg.id);
    expect(patched).toBeTruthy();
    expect(patched!.metadata.toolName).toBe("merge_tool");
    expect(patched!.metadata.toolCallId).toBe("tc-1");
    expect(patched!.metadata.toolOutput).toBe("output1");
    expect(patched!.metadata.toolError).toBe(true);
  });

  test("PATCH metadata — non-existent message returns 400", async () => {
    const res = await authRequest(app, token, "PATCH", `/api/conversations/${convId}/messages/non-existent/metadata`, { foo: "bar" });
    expect(res.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Conversation Status Management
  // ═══════════════════════════════════════════════════════════════════════

  test("PUT /api/conversations/:id — update status to failed + errorMessage", async () => {
    const convRes = await authRequest(app, token, "POST", "/api/conversations", { agentId, title: "Status Test" });
    const conv = (await convRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/conversations/${conv.id}`, {
      status: "failed",
      errorMessage: "Something went wrong",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; errorMessage: string };
    expect(data.status).toBe("failed");
    expect(data.errorMessage).toBe("Something went wrong");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Public Agent API
  // ═══════════════════════════════════════════════════════════════════════

  test("GET /api/public/agents/:id — non-public agent returns 400", async () => {
    const res = await app.request(`/api/public/agents/${agentId}`);
    expect(res.status).toBe(400);
  });

  test("Public agent — make public + access without auth", async () => {
    await authRequest(app, token, "PUT", `/api/agents/${agentId}`, { isPublic: true });

    const res = await app.request(`/api/public/agents/${agentId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { id: string; name: string; requiresPassword: boolean };
    expect(data.name).toBe("SSE Test Agent");
    expect(data.requiresPassword).toBe(false);
  });

  test("Public agent — response includes tools list", async () => {
    const res = await app.request(`/api/public/agents/${agentId}`);
    const data = (await res.json()) as { tools: unknown[] };
    expect(Array.isArray(data.tools)).toBe(true);
  });

  // ── Public Conversations ──────────────────────────────────────────────

  test("Public conversations — require fingerprint", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/conversations`);
    expect(res.status).toBe(400);
  });

  test("Public conversations — CRUD with fingerprint", async () => {
    const fp = "test-fingerprint-123";

    // Create
    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fp}`, { method: "POST" });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { conversationId: string; messages: unknown[] };
    expect(created.conversationId).toBeTruthy();
    expect(Array.isArray(created.messages)).toBe(true);

    // List
    const listRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fp}`);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { id: string; title: string; isEmpty: boolean }[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toHaveProperty("title");
    expect(list[0]).toHaveProperty("isEmpty");
    expect(list[0]).toHaveProperty("status");

    // Get specific
    const getRes = await app.request(`/api/public/agents/${agentId}/conversations/${created.conversationId}?fp=${fp}`);
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as { conversationId: string; messages: unknown[] };
    expect(detail.conversationId).toBe(created.conversationId);

    // Delete
    const delRes = await app.request(`/api/public/agents/${agentId}/conversations/${created.conversationId}?fp=${fp}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    // Verify deleted — should 400
    const getAfterDel = await app.request(`/api/public/agents/${agentId}/conversations/${created.conversationId}?fp=${fp}`);
    expect(getAfterDel.status).toBe(400);
  });

  test("Public conversations — wrong fingerprint can't access", async () => {
    const fp = "real-fp-456";

    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fp}`, { method: "POST" });
    const created = (await createRes.json()) as { conversationId: string };

    // Wrong fp → 400 (BadRequestException: Conversation not found)
    const getRes = await app.request(`/api/public/agents/${agentId}/conversations/${created.conversationId}?fp=wrong-fp`);
    expect(getRes.status).toBe(400);
  });

  // ── Password Protection ───────────────────────────────────────────────

  test("Public agent — password verify correct", async () => {
    await authRequest(app, token, "PUT", `/api/agents/${agentId}`, { publicPassword: "secret123" });

    const res = await app.request(`/api/public/agents/${agentId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret123" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { valid: boolean; token?: string };
    expect(data.valid).toBe(true);
    expect(data.token).toBeTruthy();
  });

  test("Public agent — password verify incorrect → 400", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(res.status).toBe(400);
  });

  test("Public agent — requiresPassword=true in agent info", async () => {
    const res = await app.request(`/api/public/agents/${agentId}`);
    const data = (await res.json()) as { requiresPassword: boolean };
    expect(data.requiresPassword).toBe(true);
  });

  // ── Token Verification ────────────────────────────────────────────────

  test("verify-token — no token returns invalid", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/verify-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { valid: boolean }).valid).toBe(false);
  });

  test("verify-token — invalid JWT returns invalid", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/verify-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid-jwt-token" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { valid: boolean }).valid).toBe(false);
  });

  test("verify-token — valid token from verify returns valid", async () => {
    // Get a valid token first
    const verifyRes = await app.request(`/api/public/agents/${agentId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret123" }),
    });
    const { token: publicToken } = (await verifyRes.json()) as { token: string };

    // Verify the token
    const res = await app.request(`/api/public/agents/${agentId}/verify-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: publicToken }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { valid: boolean }).valid).toBe(true);
  });

  // ── Public SSE Stream — validation ────────────────────────────────────

  test("Public stream — requires fingerprint", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/conversations/some-conv/stream`);
    expect(res.status).toBe(400);
  });

  test("Public stream — non-existent conv returns 400", async () => {
    const res = await app.request(`/api/public/agents/${agentId}/conversations/fake-conv/stream?fp=test`);
    expect(res.status).toBe(400);
  });

  // ── Public Chat SSE ────────────────────────────────────────────────────

  test("Public chat — requires fingerprint", async () => {
    await authRequest(app, token, "PUT", `/api/agents/${agentId}`, { publicPassword: null });

    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=chat-fp`, { method: "POST" });
    const { conversationId } = (await createRes.json()) as { conversationId: string };

    const res = await app.request(`/api/public/agents/${agentId}/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(400);
  });

  test("Public chat — wrong fingerprint rejected", async () => {
    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=owner-fp`, { method: "POST" });
    const { conversationId } = (await createRes.json()) as { conversationId: string };

    const res = await app.request(`/api/public/agents/${agentId}/conversations/${conversationId}/chat?fp=wrong-fp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(400);
  });

  test("Public chat — correct fingerprint saves message", async () => {
    const fp = `chat-${crypto.randomUUID()}`;
    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fp}`, { method: "POST" });
    const { conversationId } = (await createRes.json()) as { conversationId: string };

    const res = await app.request(`/api/public/agents/${agentId}/conversations/${conversationId}/chat?fp=${fp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello guest!" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data:");

    const getRes = await app.request(`/api/public/agents/${agentId}/conversations/${conversationId}?fp=${fp}`);
    const detail = (await getRes.json()) as { messages: { role: string; content: string }[] };
    expect(detail.messages.some((m) => m.role === "user" && m.content === "Hello guest!")).toBe(true);
  });

  test("Auth chat — cannot send on public conversation", async () => {
    const fp = `iso-${crypto.randomUUID()}`;
    const createRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fp}`, { method: "POST" });
    const { conversationId } = (await createRes.json()) as { conversationId: string };

    const res = await authRequest(app, token, "POST", `/api/conversations/${conversationId}/chat`, {
      agentId,
      message: "should fail",
    });
    expect(res.status).toBe(400);
  });
});
