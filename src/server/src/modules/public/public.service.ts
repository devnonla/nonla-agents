import { and, desc, eq, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { type McpCatalogTool, agentConversations, agentMessages, agentToolAssignments, agentTools, agents, getDb, llmProviders, mcpServers } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { buildMcpLangGraphName, parseMcpToolId } from "../mcp-servers/mcp-tool-id.js";
import { getBuiltinTool } from "../tools/tools.service.js";

// ── Public access token helpers ───────────────────────────────────────────────

/** Derive a signing key from the agent's public password. */
function getPublicTokenSecret(password: string): Uint8Array {
  return new TextEncoder().encode(`public_access::${password}`);
}

/** Sign a short-lived JWT for public agent access (24h). */
async function generatePublicToken(agentId: string, password: string): Promise<string> {
  return new SignJWT({ agentId, scope: "public" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(getPublicTokenSecret(password));
}

/** Verify a public access token. Returns true if valid and matches agentId. */
export async function verifyPublicToken(agentId: string, token: string): Promise<boolean> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || !agent.isPublic || !agent.publicPassword) return false;
  try {
    const { payload } = await jwtVerify(token, getPublicTokenSecret(agent.publicPassword));
    return (payload as any).agentId === agentId && (payload as any).scope === "public";
  } catch {
    return false;
  }
}

export type PublicAgentTool = { name: string; label: string; icon: string | null };

export function listPublicAgentTools(agentId: string): PublicAgentTool[] {
  const db = getDb();
  const toolRows = db.select({ toolId: agentToolAssignments.toolId, name: agentTools.name, label: agentTools.label, icon: agentTools.icon }).from(agentToolAssignments).leftJoin(agentTools, eq(agentToolAssignments.toolId, agentTools.id)).where(eq(agentToolAssignments.agentId, agentId)).all();

  return toolRows.map((t) => {
    if (t.toolId.startsWith("builtin:")) {
      const builtin = getBuiltinTool(t.toolId);
      return { name: builtin?.name ?? t.toolId, label: builtin?.label ?? t.toolId, icon: null };
    }
    const mcp = parseMcpToolId(t.toolId);
    if (mcp) {
      const server = db.select().from(mcpServers).where(eq(mcpServers.id, mcp.serverId)).get();
      const catalog = (server?.tools ?? []) as McpCatalogTool[];
      const def = catalog.find((d) => d.name === mcp.toolName);
      return {
        name: buildMcpLangGraphName(server?.name ?? "mcp", mcp.toolName),
        label: `${server?.name ?? "mcp"} → ${def?.name ?? mcp.toolName}`,
        icon: null,
      };
    }
    return { name: t.name ?? "", label: t.label ?? "", icon: t.icon ?? null };
  });
}

export function getPublicAgent(agentId: string) {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new BadRequestException("Agent not found");
  if (!agent.isPublic) throw new BadRequestException("Thật đáng tiếc, Agent này không được chia sẻ công khai.");

  let providerLabel: string | undefined;
  if (agent.aiProvider) {
    const provider = db.select().from(llmProviders).where(eq(llmProviders.id, agent.aiProvider)).get();
    providerLabel = provider?.label;
  }

  return {
    data: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      requiresPassword: !!agent.publicPassword && agent.publicPassword.length > 0,
      model: agent.aiModel ?? undefined,
      providerLabel: providerLabel ?? undefined,
      tools: listPublicAgentTools(agentId),
    },
  };
}

export async function verifyPublicPassword(agentId: string, password?: string) {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || !agent.isPublic) throw new BadRequestException("Agent unavailable");
  if (agent.publicPassword && agent.publicPassword !== password) {
    throw new BadRequestException("Mật khẩu không chính xác.");
  }
  const token = agent.publicPassword ? await generatePublicToken(agentId, agent.publicPassword) : undefined;
  return { valid: true, token };
}

// ── Conversation helpers ───────────────────────────────────────────────────────

function loadConvMessages(convId: string) {
  return getDb()
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, convId))
    .orderBy(sql`rowid`)
    .all()
    .filter((r) => !(r.role === "tool" && r.content === ""));
}

/** List all public conversations for a fingerprint, newest first. */
export function listPublicConversations(agentId: string, fingerprint: string) {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || !agent.isPublic) throw new BadRequestException("Agent unavailable");

  const convs = db
    .select()
    .from(agentConversations)
    .where(and(eq(agentConversations.agentId, agentId), eq(agentConversations.trigger, "public"), eq(agentConversations.ownerId, fingerprint)))
    .orderBy(desc(agentConversations.createdAt))
    .all();

  // Use first user message as title/preview
  const result = convs.map((conv) => {
    const firstMsg = db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.conversationId, conv.id), eq(agentMessages.role, "user")))
      .orderBy(sql`rowid`)
      .get();
    return {
      id: conv.id,
      title: firstMsg ? firstMsg.content.slice(0, 60) : "New Chat",
      createdAt: conv.createdAt,
      isEmpty: !firstMsg,
      status: conv.status,
    };
  });

  return { data: result };
}

/** Create a brand-new public conversation for this fingerprint. */
export function createPublicConversation(agentId: string, fingerprint: string) {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || !agent.isPublic) throw new BadRequestException("Agent unavailable");

  const convId = crypto.randomUUID();
  const now = new Date();
  db.insert(agentConversations)
    .values({
      id: convId,
      agentId,
      title: "New Chat",
      trigger: "public",
      ownerId: fingerprint,
      status: "done",
      startedAt: now,
      createdAt: now,
    })
    .run();

  return { data: { conversationId: convId, messages: [] } };
}

/** Ensure public conversation exists and belongs to this fingerprint. */
export function requirePublicConversation(agentId: string, convId: string, fingerprint: string) {
  const conv = getDb()
    .select()
    .from(agentConversations)
    .where(and(eq(agentConversations.id, convId), eq(agentConversations.agentId, agentId), eq(agentConversations.trigger, "public"), eq(agentConversations.ownerId, fingerprint)))
    .get();
  if (!conv) throw new BadRequestException("Conversation not found");
  return conv;
}

/** Load an existing public conversation by ID (validates ownership). */
export function getPublicConversation(agentId: string, convId: string, fingerprint: string) {
  requirePublicConversation(agentId, convId, fingerprint);
  const msgs = loadConvMessages(convId);
  return { data: { conversationId: convId, messages: msgs } };
}

/** Delete a public conversation (validates ownership). */
export function deletePublicConversation(agentId: string, convId: string, fingerprint: string) {
  requirePublicConversation(agentId, convId, fingerprint);
  const db = getDb();
  db.delete(agentMessages).where(eq(agentMessages.conversationId, convId)).run();
  db.delete(agentConversations).where(eq(agentConversations.id, convId)).run();
}
