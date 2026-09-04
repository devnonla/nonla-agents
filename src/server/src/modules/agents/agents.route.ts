import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException, InternalServerErrorException } from "../../common/exceptions/http.exception.js";
import { addAssignment, addSkillAssignment, cloneAgent, createAgent, deleteAgent, getAgent, listAgentsEnriched, listAssignments, listSkillAssignments, removeAssignment, removeSkillAssignment, reorderAgents, setAssignments, setSkillAssignments, updateAgent } from "./agents.service.js";
import { createEdge, createNode, deleteEdge, deleteNode, getMemory, updateNode } from "./memory.service.js";
import { type PromptStreamRequest, streamPromptAgent } from "./prompt-agent/prompt-agent.service.js";
import { generateResponse, stopStream } from "./runtime/runtime.service.js";

const app = new Hono();

// ─── Agent CRUD ──────────────────────────────────────────────────────────────

// GET /api/agents?page=1&limit=50&sorts=-createdAt&search=&status=active
app.get("/", async (c) => {
  const user = (c as any).get("user") as { id: string; role: string } | undefined;
  return c.json(await listAgentsEnriched(c.req.query(), user));
});

// PUT /api/agents/reorder — persist board order within a team (or ungrouped)
app.put("/reorder", async (c) => {
  const body = await c.req.json<{ teamId?: string | null; agentIds?: string[] }>();
  return c.json(await reorderAgents(body.teamId ?? null, body.agentIds ?? []));
});

// GET /api/agents/:id
app.get("/:id", async (c) => {
  const row = await getAgent(c.req.param("id"));
  if (!row) throw new BadRequestException("Agent not found");
  return c.json(row);
});

// POST /api/agents
app.post("/", async (c) => {
  const body = await c.req.json();
  const user = (c as any).get("user") as { id: string } | undefined;
  if (user) body.createdBy = user.id;
  return c.json(await createAgent(body), 201);
});

// PUT /api/agents/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(await updateAgent(c.req.param("id"), body));
});

// POST /api/agents/:id/clone
app.post("/:id/clone", async (c) => {
  const user = (c as any).get("user") as { id: string } | undefined;
  const cloned = await cloneAgent(c.req.param("id"), user?.id);
  if (!cloned) throw new BadRequestException("Agent not found");
  return c.json(cloned, 201);
});

// DELETE /api/agents/:id
app.delete("/:id", async (c) => {
  await deleteAgent(c.req.param("id"));
  return c.json({ ok: true });
});

// ─── Memory (user knowledge graph) ───────────────────────────────────────────

app.get("/:id/memory", async (c) => {
  return c.json(await getMemory(c.req.param("id")));
});

app.post("/:id/memory/nodes", async (c) => {
  const user = (c as any).get("user") as { id: string };
  const body = await c.req.json<{
    content: string;
    sourceConversationId?: string | null;
    ownerId?: string;
  }>();
  const ownerId = body.ownerId?.trim() || user.id;
  return c.json(await createNode(c.req.param("id"), ownerId, body), 201);
});

app.put("/:id/memory/nodes/:nodeId", async (c) => {
  const body = await c.req.json<{ content?: string }>();
  return c.json(await updateNode(c.req.param("id"), c.req.param("nodeId"), body));
});

app.delete("/:id/memory/nodes/:nodeId", async (c) => {
  return c.json(await deleteNode(c.req.param("id"), c.req.param("nodeId")));
});

app.post("/:id/memory/edges", async (c) => {
  const user = (c as any).get("user") as { id: string };
  const body = await c.req.json<{ fromId: string; toId: string; relation: string; ownerId?: string }>();
  const ownerId = body.ownerId?.trim() || user.id;
  return c.json(await createEdge(c.req.param("id"), ownerId, body), 201);
});

app.delete("/:id/memory/edges/:edgeId", async (c) => {
  return c.json(await deleteEdge(c.req.param("id"), c.req.param("edgeId")));
});

// ─── Tool Assignments ────────────────────────────────────────────────────────

// GET /api/agents/:id/tool-assignments
app.get("/:id/tool-assignments", async (c) => {
  return c.json(await listAssignments(c.req.param("id")));
});

// PUT /api/agents/:id/tool-assignments — replace all
app.put("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{
    items: { toolId: string; parameters?: Record<string, unknown> }[];
  }>();
  return c.json(await setAssignments(c.req.param("id"), body.items ?? (body as any)));
});

// POST /api/agents/:id/tool-assignments — add one
app.post("/:id/tool-assignments", async (c) => {
  const body = await c.req.json<{
    toolId: string;
    parameters?: Record<string, unknown>;
  }>();
  const result = await addAssignment(c.req.param("id"), body);
  if (!result) throw new BadRequestException("Failed to add assignment");
  return c.json(result, 201);
});

// DELETE /api/agents/:id/tool-assignments/:aid
app.delete("/:id/tool-assignments/:aid", async (c) => {
  await removeAssignment(c.req.param("aid"));
  return c.json({ ok: true });
});

// ─── Skill Assignments ───────────────────────────────────────────────────────

app.get("/:id/skill-assignments", async (c) => {
  return c.json(await listSkillAssignments(c.req.param("id")));
});

app.put("/:id/skill-assignments", async (c) => {
  const body = await c.req.json<{ items: { skillId: string }[] }>();
  return c.json(await setSkillAssignments(c.req.param("id"), body.items ?? []));
});

app.post("/:id/skill-assignments", async (c) => {
  const body = await c.req.json<{ skillId: string }>();
  if (!body.skillId) throw new BadRequestException("skillId is required");
  const result = await addSkillAssignment(c.req.param("id"), body);
  if (!result) throw new BadRequestException("Failed to add skill assignment");
  return c.json(result, 201);
});

app.delete("/:id/skill-assignments/:aid", async (c) => {
  await removeSkillAssignment(c.req.param("aid"));
  return c.json({ ok: true });
});

// ─── Chat ────────────────────────────────────────────────────────────────────

// POST /api/agents/:id/chat/stop
app.post("/:id/chat/stop", async (c) => {
  const { conversationId } = await c.req.json<{ conversationId: string }>();
  if (!conversationId) throw new BadRequestException("conversationId is required");
  return c.json({ ok: await stopStream(conversationId) });
});

// POST /api/agents/:id/generate
app.post("/:id/generate", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<{
    message: string;
    conversationId?: string;
    maxSteps?: number;
  }>();
  try {
    const user = (c as any).get("user") as { id: string } | undefined;
    const result = await generateResponse(agentId, body.message, body.conversationId, body.maxSteps, {
      ownerId: user?.id,
    });
    return c.json({ ok: true, text: result.text });
  } catch (err) {
    throw new InternalServerErrorException(err instanceof Error ? err.message : String(err));
  }
});

// ─── Prompt Assistant ────────────────────────────────────────────────────────

// POST /api/agents/:id/assistant/prompt/stream
app.post("/:id/assistant/prompt/stream", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json<PromptStreamRequest>();

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();

    // When client disconnects (stop button, page close, navigation), abort the agent
    stream.onAbort(() => {
      abort.abort();
    });

    await streamPromptAgent(agentId, body, stream, abort.signal);
  });
});

export default app;
