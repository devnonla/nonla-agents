import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SSEStreamingApi } from "hono/streaming";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/http.exception.js";
import { stopStream, streamChatSSE } from "../agents/runtime/runtime.service.js";
import { apiConversationOwnerId, canAccessAgent, listAccessibleAgents } from "../api-keys/api-keys.service.js";
import { createConversation, getConversation } from "../conversations/conversations.service.js";
import { getApiKey, requireApiKey } from "./api-key.middleware.js";
import datatablesV1 from "./v1-datatables.route.js";
import kvV1 from "./v1-kv.route.js";

const app = new Hono();

app.use("*", requireApiKey);

app.get("/agents", async (c) => c.json(await listAccessibleAgents(getApiKey(c))));
app.route("/datatables", datatablesV1);
app.route("/kv", kvV1);

type ChatBody = {
  agentId?: string;
  message?: string;
  conversationId?: string;
  stream?: boolean;
};

function assertAgentAccess(apiKey: ReturnType<typeof getApiKey>, agentId: string) {
  if (!canAccessAgent(apiKey, agentId)) {
    throw new ForbiddenException("This API key cannot access that agent");
  }
}

async function requireApiConversation(conversationId: string, apiKeyId: string, agentId: string) {
  const conv = await getConversation(conversationId);
  if (!conv || conv.trigger !== "api" || conv.ownerId !== apiConversationOwnerId(apiKeyId) || conv.agentId !== agentId) {
    throw new ForbiddenException("Conversation not found");
  }
  return conv;
}

function createCollectingStream() {
  const events: Record<string, unknown>[] = [];
  const stream = {
    writeSSE: async (frame: { data: string }) => {
      try {
        events.push(JSON.parse(frame.data) as Record<string, unknown>);
      } catch {
        /* ignore malformed */
      }
    },
    onAbort: (_cb?: () => void) => {},
  };
  return { stream: stream as unknown as SSEStreamingApi, events };
}

app.post("/chat/stop", async (c) => {
  const apiKey = getApiKey(c);
  const body = await c.req.json<{ conversationId?: string }>();
  const conversationId = body.conversationId?.trim();
  if (!conversationId) throw new BadRequestException("conversationId is required");

  const conv = await getConversation(conversationId);
  if (!conv || conv.trigger !== "api" || conv.ownerId !== apiConversationOwnerId(apiKey.id)) {
    throw new ForbiddenException("Conversation not found");
  }
  return c.json({ ok: await stopStream(conversationId) });
});

app.post("/chat", async (c) => {
  const apiKey = getApiKey(c);
  const body = await c.req.json<ChatBody>();
  const agentId = body.agentId?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  if (!agentId) throw new BadRequestException("agentId is required");
  if (!message) throw new BadRequestException("message is required");
  assertAgentAccess(apiKey, agentId);

  let conversationId = body.conversationId?.trim() || "";
  if (conversationId) {
    await requireApiConversation(conversationId, apiKey.id, agentId);
  } else {
    const conv = await createConversation({
      agentId,
      title: "API Chat",
      trigger: "api",
      ownerId: apiConversationOwnerId(apiKey.id),
    });
    conversationId = conv.id as string;
  }

  const streaming = body.stream !== false;
  if (!streaming) {
    const { stream, events } = createCollectingStream();
    await streamChatSSE({ agentId, conversationId, message }, stream);
    let content = "";
    let status: "done" | "failed" = "done";
    let error: string | undefined;
    for (const ev of events) {
      if (ev.type === "text-delta") content += String(ev.text ?? "");
      if (ev.type === "done") {
        if (typeof ev.text === "string" && ev.text) content = ev.text;
        status = "done";
      }
      if (ev.type === "error") {
        status = "failed";
        error = String(ev.error ?? "Unknown error");
      }
    }
    return c.json({ conversationId, content, status, ...(error ? { error } : {}) });
  }

  return streamSSE(c, async (sse) => {
    await sse.writeSSE({ data: JSON.stringify({ type: "conversation", conversationId }) });
    await streamChatSSE({ agentId, conversationId, message }, sse);
  });
});

export default app;
