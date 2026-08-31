import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { streamChatSSE } from "../agents/runtime/runtime.service.js";
import { relayRunToSSE, runRegistry } from "../agents/runtime/utils/run-registry.js";
import { cancelConversationBgTask, getConversationBgTask, listConversationBgTasks } from "../tools/tools.service.js";
import { createConversation, createMessage, deleteConversation, getMessageFeed, listConversations, listMessages, patchMessageMeta, requireOwnedConversation, updateConversation } from "./conversations.service.js";

const app = new Hono();

function requireUser(c: { get: (key: string) => unknown }) {
  const user = c.get("user") as { id: string; role: string } | undefined;
  if (!user) throw new UnauthorizedException("Authentication required");
  return user;
}

// GET /api/conversations?page=1&limit=50&sorts=-createdAt&agentId=xxx
app.get("/", (c) => {
  const user = requireUser(c);
  return c.json(listConversations(user.id, c.req.query()));
});

// GET /api/conversations/feed/messages — must be before /:id
app.get("/feed/messages", (c) => {
  const user = requireUser(c);
  const agentId = c.req.query("agentId");
  if (!agentId) throw new BadRequestException("agentId required");
  return c.json(getMessageFeed(agentId, user.id, c.req.query("cursor")));
});

// GET /api/conversations/:id
app.get("/:id", (c) => {
  const user = requireUser(c);
  return c.json(requireOwnedConversation(c.req.param("id"), user.id));
});

// POST /api/conversations
app.post("/", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json();
  return c.json(createConversation({ ...body, ownerId: user.id }), 201);
});

// PUT /api/conversations/:id
app.put("/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  requireOwnedConversation(id, user.id);
  const body = await c.req.json();
  return c.json(updateConversation(id, body));
});

// DELETE /api/conversations/:id
app.delete("/:id", (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  requireOwnedConversation(id, user.id);
  deleteConversation(id);
  return c.json({ ok: true });
});

// GET /api/conversations/:id/messages
app.get("/:id/messages", (c) => {
  const user = requireUser(c);
  requireOwnedConversation(c.req.param("id"), user.id);
  return c.json(listMessages(c.req.param("id")));
});

// GET /api/conversations/:id/bg-tasks
app.get("/:id/bg-tasks", (c) => {
  const user = requireUser(c);
  requireOwnedConversation(c.req.param("id"), user.id);
  return c.json({ items: listConversationBgTasks(c.req.param("id")) });
});

// GET /api/conversations/:id/bg-tasks/:taskId
app.get("/:id/bg-tasks/:taskId", (c) => {
  const user = requireUser(c);
  const conversationId = c.req.param("id");
  requireOwnedConversation(conversationId, user.id);
  const task = getConversationBgTask(conversationId, c.req.param("taskId"));
  if (!task) throw new BadRequestException("Task not found");
  return c.json(task);
});

// POST /api/conversations/:id/bg-tasks/:taskId/cancel
app.post("/:id/bg-tasks/:taskId/cancel", (c) => {
  const user = requireUser(c);
  const conversationId = c.req.param("id");
  requireOwnedConversation(conversationId, user.id);
  const task = cancelConversationBgTask(conversationId, c.req.param("taskId"));
  if (!task) throw new BadRequestException("Task not found");
  return c.json(task);
});

// POST /api/conversations/:id/messages
app.post("/:id/messages", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  requireOwnedConversation(id, user.id);
  const body = await c.req.json();
  return c.json(createMessage(id, body), 201);
});

// PATCH /api/conversations/:convId/messages/:msgId/metadata
app.patch("/:convId/messages/:msgId/metadata", async (c) => {
  const user = requireUser(c);
  requireOwnedConversation(c.req.param("convId"), user.id);
  const patch = await c.req.json<Record<string, unknown>>();
  const result = patchMessageMeta(c.req.param("msgId"), patch);
  if (!result) throw new BadRequestException("Message not found");
  return c.json(result);
});

// ─── Chat send (SSE response) ────────────────────────────────────────────────
// POST /api/conversations/:id/chat — starts a background agent run, then relays
// events over SSE. Disconnecting does NOT cancel the run (use /chat/stop).
app.post("/:id/chat", async (c) => {
  const user = requireUser(c);
  const conversationId = c.req.param("id");
  requireOwnedConversation(conversationId, user.id);
  const body = await c.req.json<{ agentId: string; message: string; password?: string; token?: string }>();

  return streamSSE(c, async (stream) => {
    await streamChatSSE({ ...body, conversationId }, stream);
  });
});

// ─── SSE Stream ──────────────────────────────────────────────────────────────
// GET /api/conversations/:id/stream — subscribe to a running (or recently finished)
// background task. Replays buffered events so F5 mid-stream catches up.
app.get("/:id/stream", (c) => {
  const user = requireUser(c);
  const conversationId = c.req.param("id");
  requireOwnedConversation(conversationId, user.id);

  return streamSSE(c, async (stream) => {
    // Wait for stream to become available (GET opened before POST registers the run)
    const maxWait = 5000;
    const pollInterval = 50;
    let waited = 0;
    while (!runRegistry.has(conversationId) && waited < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      waited += pollInterval;
    }

    if (!runRegistry.has(conversationId)) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "No active stream" }) });
      return;
    }

    await relayRunToSSE(conversationId, stream);
  });
});

export default app;
