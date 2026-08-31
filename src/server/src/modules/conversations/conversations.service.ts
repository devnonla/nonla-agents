import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { type AgentConversation, type NewAgentConversation, type NewAgentMessage, agentConversations, agentMessages, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { runRegistry } from "../agents/runtime/utils/run-registry.js";

/** Orphan "running" rows (process crashed / lost registry) older than this become done. */
const STALE_MS = 15 * 60_000;

export function listConversations(ownerId: string, query: RawQuery = {}) {
  // Build static WHERE: owner + exclude public/api triggers, optionally filter by agentId
  const agentId = query.agentId;
  const hiddenTriggers = notInArray(agentConversations.trigger, ["public", "api"]);
  const staticWhere = agentId ? and(eq(agentConversations.ownerId, ownerId), eq(agentConversations.agentId, agentId), hiddenTriggers) : and(eq(agentConversations.ownerId, ownerId), hiddenTriggers);

  // Remove agentId from query so listQuery doesn't re-apply it as a column filter
  const { agentId: _, ...cleanQuery } = query;

  const result = listQuery({ table: agentConversations, where: staticWhere }, cleanQuery);

  // Heal orphan "running" conversations (no live registry entry, last start older than STALE_MS)
  const now = new Date();
  const db = getDb();
  result.items = result.items.map((conv: any) => {
    if (conv.status !== "running") return conv;
    // Active background run — never force-done mid-stream
    if (runRegistry.isActive(conv.id)) return conv;
    const anchor = conv.startedAt ?? conv.createdAt ?? now;
    const age = now.getTime() - new Date(anchor as Date | string | number).getTime();
    if (age < STALE_MS) return conv;
    db.update(agentConversations).set({ status: "done", finishedAt: now }).where(eq(agentConversations.id, conv.id)).run();
    return { ...conv, status: "done" as const, finishedAt: now };
  });

  return result;
}

export function getConversation(id: string) {
  return getDb().select().from(agentConversations).where(eq(agentConversations.id, id)).get();
}

/** Ensure conversation exists and belongs to the given owner. */
export function requireOwnedConversation(id: string, ownerId: string): AgentConversation {
  const conv = getConversation(id);
  if (!conv || conv.trigger === "public") throw new BadRequestException("Not found");
  if (conv.ownerId !== ownerId) throw new ForbiddenException("Forbidden");
  return conv;
}

export function createConversation(body: {
  agentId: string;
  title?: string;
  trigger?: NewAgentConversation["trigger"];
  ownerId: string;
}) {
  const now = new Date();
  const conv: NewAgentConversation = {
    id: crypto.randomUUID(),
    agentId: body.agentId,
    title: body.title ?? "New Chat",
    trigger: body.trigger ?? "manual",
    ownerId: body.ownerId,
    status: "done",
    startedAt: now,
    createdAt: now,
  };
  getDb().insert(agentConversations).values(conv).run();
  wsHub.emit("conversations:created", conv);
  return conv;
}

export function updateConversation(id: string, body: Partial<Pick<NewAgentConversation, "title" | "status" | "finishedAt" | "errorMessage">>) {
  getDb().update(agentConversations).set(body).where(eq(agentConversations.id, id)).run();
  const updated = getDb().select().from(agentConversations).where(eq(agentConversations.id, id)).get();
  wsHub.emit("conversations:updated", updated);
  return updated;
}

export function deleteConversation(id: string) {
  getDb().delete(agentConversations).where(eq(agentConversations.id, id)).run();
  wsHub.emit("conversations:deleted", { id });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function listMessages(conversationId: string) {
  return getDb()
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(sql`rowid`)
    .all()
    .filter((r) => !(r.role === "tool" && r.content === ""));
}

export function createMessage(conversationId: string, body: Omit<NewAgentMessage, "id" | "conversationId" | "createdAt">) {
  const msg: NewAgentMessage = { ...body, id: crypto.randomUUID(), conversationId, createdAt: new Date() };
  getDb().insert(agentMessages).values(msg).run();
  wsHub.emit("messages:created", msg);
  return msg;
}

export function patchMessageMeta(msgId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, msgId)).get();
  if (!row) return null;
  const merged = { ...(row.metadata ?? {}), ...patch };
  db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)).run();
  return { ok: true };
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export function getMessageFeed(agentId: string, ownerId: string, cursor?: string) {
  const PAGE = 30;
  const db = getDb();
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const convRows = db
    .select()
    .from(agentConversations)
    .where(and(eq(agentConversations.agentId, agentId), eq(agentConversations.ownerId, ownerId)))
    .orderBy(desc(agentConversations.createdAt))
    .all();

  if (convRows.length === 0) return { items: [], hasMore: false };

  const convMap = new Map(convRows.map((conv) => [conv.id, conv]));
  const ownedConvIds = convRows.map((c) => c.id);

  const whereClause = cursorDate ? and(eq(agentMessages.agentId, agentId), inArray(agentMessages.conversationId, ownedConvIds), lt(agentMessages.createdAt, cursorDate)) : and(eq(agentMessages.agentId, agentId), inArray(agentMessages.conversationId, ownedConvIds));

  const msgRows = db
    .select()
    .from(agentMessages)
    .where(whereClause)
    .orderBy(desc(agentMessages.createdAt))
    .limit(PAGE + 1)
    .all();

  const filtered = msgRows.filter((r) => !(r.role === "tool" && r.content === ""));
  const hasMore = filtered.length > PAGE;
  const page = filtered
    .slice(0, PAGE)
    .map((m) => {
      const conv = m.conversationId ? convMap.get(m.conversationId) : undefined;
      return { ...m, convTitle: conv?.title ?? "Unknown", convTrigger: conv?.trigger ?? "manual", convCreatedAt: conv?.createdAt ?? null };
    })
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  return { items: page, hasMore };
}

// ─── Streaming Helpers ────────────────────────────────────────────────────────
// Used by the agent runtime streaming loop. Support targeted WS delivery via clientId.

/**
 * Save a message to DB.
 */
export function saveMessage(data: Omit<NewAgentMessage, "id" | "createdAt">): { id: string } & NewAgentMessage {
  const db = getDb();
  const id = crypto.randomUUID();
  const msg = { ...data, id, createdAt: new Date() } as NewAgentMessage;
  db.insert(agentMessages).values(msg).run();
  return { ...msg, id };
}

/**
 * Append suffix to an existing message's content.
 */
export function appendMessageContent(msgId: string, suffix: string) {
  if (!suffix) return;
  const db = getDb();
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, msgId)).get();
  if (!row) return;
  db.update(agentMessages)
    .set({ content: `${row.content ?? ""}${suffix}` })
    .where(eq(agentMessages.id, msgId))
    .run();
}

/**
 * Merge patch into message metadata.
 */
export function patchMessageMetadata(msgId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, msgId)).get();
  if (!row) return;
  const merged = { ...(row.metadata ?? {}), ...patch } as Record<string, unknown>;
  db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)).run();
}

/**
 * Update conversation status (done/failed) and broadcast via WS.
 */
export function updateConversationStatus(conversationId: string, data: { status: "done" | "failed"; finishedAt: Date; errorMessage?: string }) {
  const db = getDb();
  db.update(agentConversations).set(data).where(eq(agentConversations.id, conversationId)).run();
  const updated = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updated) {
    // Always broadcast to ALL clients so other tabs can update their UI
    wsHub.broadcast("conversations:updated", updated);
  }
}
