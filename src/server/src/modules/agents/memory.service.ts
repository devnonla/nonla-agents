import { and, eq, inArray, or } from "drizzle-orm";
import { MEMORY_RELATION_MAX, agentConversations, getDb, memoryEdges, memoryNodes, users } from "../../common/db/client.js";
import { BadRequestException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { getAgent } from "./agents.service.js";
import { MEMORY_CONTENT_MAX, nodePromptLine, nodeTitle } from "./runtime/utils/factBudget.js";

export type MemorySessionBranch = {
  conversationId: string;
  title: string;
  nodeCount: number;
};

export type MemoryOwnerBranch = {
  ownerId: string;
  label: string;
  avatar: string | null;
  isGuest: boolean;
  nodeCount: number;
  sessions: MemorySessionBranch[];
};

function requireAgent(agentId: string) {
  const agent = getAgent(agentId);
  if (!agent) throw new NotFoundException("Agent not found");
  return agent;
}

function shortOwnerId(ownerId: string): string {
  const raw = ownerId.startsWith("guest:") ? ownerId.slice("guest:".length) : ownerId;
  return raw.length > 8 ? raw.slice(0, 8) : raw;
}

function ownerMeta(ownerId: string, userMap: Map<string, { name: string; username: string; avatar: string | null }>, guestOwnerIds: Set<string>): { label: string; avatar: string | null; isGuest: boolean } {
  const user = userMap.get(ownerId);
  if (user) {
    return {
      label: user.name?.trim() || user.username,
      avatar: user.avatar ?? null,
      isGuest: false,
    };
  }
  const isGuest = guestOwnerIds.has(ownerId) || ownerId.startsWith("guest:");
  if (isGuest) {
    return {
      label: `Guest · ${shortOwnerId(ownerId)}`,
      avatar: null,
      isGuest: true,
    };
  }
  return {
    label: shortOwnerId(ownerId),
    avatar: null,
    isGuest: false,
  };
}

function sortNodes<T extends { updatedAt: Date | null }>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => {
    const ta = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
    const tb = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
    return tb - ta;
  });
}

function buildBranches(nodes: { ownerId: string; sourceConversationId: string | null }[], convTitles: Map<string, string>, userMap: Map<string, { name: string; username: string; avatar: string | null }>, guestOwnerIds: Set<string>): MemoryOwnerBranch[] {
  const byOwner = new Map<string, Map<string, number>>();
  const nodeCountByOwner = new Map<string, number>();

  for (const node of nodes) {
    nodeCountByOwner.set(node.ownerId, (nodeCountByOwner.get(node.ownerId) ?? 0) + 1);
    if (!node.sourceConversationId) continue;
    let sessions = byOwner.get(node.ownerId);
    if (!sessions) {
      sessions = new Map();
      byOwner.set(node.ownerId, sessions);
    }
    sessions.set(node.sourceConversationId, (sessions.get(node.sourceConversationId) ?? 0) + 1);
  }

  const ownerIds = [...nodeCountByOwner.keys()];
  const branches: MemoryOwnerBranch[] = ownerIds.map((ownerId) => {
    const sessions = byOwner.get(ownerId);
    const sessionList: MemorySessionBranch[] = [];
    if (sessions) {
      for (const [conversationId, count] of sessions) {
        sessionList.push({
          conversationId,
          title: convTitles.get(conversationId) ?? `Session · ${conversationId.slice(0, 8)}`,
          nodeCount: count,
        });
      }
      sessionList.sort((a, b) => b.nodeCount - a.nodeCount);
    }
    const meta = ownerMeta(ownerId, userMap, guestOwnerIds);
    return {
      ownerId,
      label: meta.label,
      avatar: meta.avatar,
      isGuest: meta.isGuest,
      nodeCount: nodeCountByOwner.get(ownerId) ?? 0,
      sessions: sessionList,
    };
  });

  branches.sort((a, b) => b.nodeCount - a.nodeCount || a.label.localeCompare(b.label));
  return branches;
}

/** Normalize free-form relation to short snake_case label. */
export function normalizeRelation(raw: string | null | undefined): string {
  const input = (raw ?? "").trim() || "related_to";
  const s = input
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!s) throw new BadRequestException("relation is required");
  if (s.length > MEMORY_RELATION_MAX) {
    throw new BadRequestException(`relation must be ≤${MEMORY_RELATION_MAX} characters`);
  }
  return s;
}

/** @deprecated */
export const parseRelation = normalizeRelation;

export function getMemory(agentId: string) {
  requireAgent(agentId);
  const db = getDb();

  const nodes = sortNodes(db.select().from(memoryNodes).where(eq(memoryNodes.agentId, agentId)).all());
  const edges = db.select().from(memoryEdges).where(eq(memoryEdges.agentId, agentId)).all();

  const ownerIds = [...new Set(nodes.map((n) => n.ownerId))];
  const userRows = ownerIds.length === 0 ? [] : db.select({ id: users.id, name: users.name, username: users.username, avatar: users.avatar }).from(users).where(inArray(users.id, ownerIds)).all();
  const userMap = new Map(userRows.map((u) => [u.id, { name: u.name, username: u.username, avatar: u.avatar }]));

  const convIds = [...new Set(nodes.map((n) => n.sourceConversationId).filter((id): id is string => !!id))];
  const convRows =
    convIds.length === 0
      ? []
      : db
          .select({
            id: agentConversations.id,
            title: agentConversations.title,
            ownerId: agentConversations.ownerId,
            trigger: agentConversations.trigger,
          })
          .from(agentConversations)
          .where(inArray(agentConversations.id, convIds))
          .all();
  const convTitles = new Map(convRows.map((c) => [c.id, c.title]));

  const guestOwnerIds = new Set<string>();
  for (const conv of convRows) {
    if (conv.trigger === "public") guestOwnerIds.add(conv.ownerId);
  }
  if (ownerIds.length > 0) {
    const publicOwners = db
      .select({ ownerId: agentConversations.ownerId })
      .from(agentConversations)
      .where(and(eq(agentConversations.agentId, agentId), eq(agentConversations.trigger, "public"), inArray(agentConversations.ownerId, ownerIds)))
      .all();
    for (const row of publicOwners) guestOwnerIds.add(row.ownerId);
  }

  const branches = buildBranches(nodes, convTitles, userMap, guestOwnerIds);

  return {
    nodes,
    edges,
    branches,
  };
}

export function createNode(
  agentId: string,
  ownerId: string,
  body: {
    content: string;
    sourceConversationId?: string | null;
  },
) {
  requireAgent(agentId);
  const content = body.content?.trim();
  if (!content) throw new BadRequestException("content is required");
  if (content.length > MEMORY_CONTENT_MAX) {
    throw new BadRequestException(`content must be ≤${MEMORY_CONTENT_MAX} characters`);
  }

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    agentId,
    ownerId,
    content,
    sourceConversationId: body.sourceConversationId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(memoryNodes).values(row).run();
  return row;
}

export function updateNode(agentId: string, nodeId: string, body: { content?: string }) {
  requireAgent(agentId);
  const db = getDb();
  const existing = db
    .select()
    .from(memoryNodes)
    .where(and(eq(memoryNodes.id, nodeId), eq(memoryNodes.agentId, agentId)))
    .get();
  if (!existing) throw new NotFoundException("Node not found");

  const patch: Partial<typeof existing> = { updatedAt: new Date() };
  if (body.content !== undefined) {
    const content = body.content.trim();
    if (!content) throw new BadRequestException("content cannot be empty");
    if (content.length > MEMORY_CONTENT_MAX) {
      throw new BadRequestException(`content must be ≤${MEMORY_CONTENT_MAX} characters`);
    }
    patch.content = content;
  }

  db.update(memoryNodes).set(patch).where(eq(memoryNodes.id, nodeId)).run();
  return db.select().from(memoryNodes).where(eq(memoryNodes.id, nodeId)).get();
}

export function deleteNode(agentId: string, nodeId: string) {
  requireAgent(agentId);
  const db = getDb();
  const existing = db
    .select({ id: memoryNodes.id })
    .from(memoryNodes)
    .where(and(eq(memoryNodes.id, nodeId), eq(memoryNodes.agentId, agentId)))
    .get();
  if (!existing) throw new NotFoundException("Node not found");
  db.delete(memoryEdges)
    .where(and(eq(memoryEdges.agentId, agentId), or(eq(memoryEdges.fromId, nodeId), eq(memoryEdges.toId, nodeId))))
    .run();
  db.delete(memoryNodes).where(eq(memoryNodes.id, nodeId)).run();
  return { ok: true };
}

export function createEdge(agentId: string, ownerId: string, body: { fromId: string; toId: string; relation: string }) {
  requireAgent(agentId);
  const fromId = body.fromId?.trim();
  const toId = body.toId?.trim();
  if (!fromId || !toId) throw new BadRequestException("fromId and toId are required");
  if (fromId === toId) throw new BadRequestException("Cannot link a node to itself");
  const relation = normalizeRelation(body.relation);

  const db = getDb();
  const from = db
    .select()
    .from(memoryNodes)
    .where(and(eq(memoryNodes.id, fromId), eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
    .get();
  const to = db
    .select()
    .from(memoryNodes)
    .where(and(eq(memoryNodes.id, toId), eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
    .get();
  if (!from || !to) throw new NotFoundException("Both nodes must exist for this user");

  const existing = db
    .select()
    .from(memoryEdges)
    .where(and(eq(memoryEdges.agentId, agentId), eq(memoryEdges.fromId, fromId), eq(memoryEdges.toId, toId), eq(memoryEdges.relation, relation)))
    .get();
  if (existing) return existing;

  const row = {
    id: crypto.randomUUID(),
    agentId,
    ownerId,
    fromId,
    toId,
    relation,
    createdAt: new Date(),
  };
  db.insert(memoryEdges).values(row).run();
  return row;
}

export function deleteEdge(agentId: string, edgeId: string) {
  requireAgent(agentId);
  const db = getDb();
  const existing = db
    .select({ id: memoryEdges.id })
    .from(memoryEdges)
    .where(and(eq(memoryEdges.id, edgeId), eq(memoryEdges.agentId, agentId)))
    .get();
  if (!existing) throw new NotFoundException("Edge not found");
  db.delete(memoryEdges).where(eq(memoryEdges.id, edgeId)).run();
  return { ok: true };
}

export function formatNodeForPrompt(n: { id: string; content: string }): string {
  return `- [${n.id}] ${nodePromptLine(n)}`;
}

export { nodeTitle };
