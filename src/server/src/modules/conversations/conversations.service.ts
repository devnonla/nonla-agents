import { and, asc, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { type AgentConversation, type NewAgentConversation, type NewAgentMessage, agentConversations, agentMessages, getDb, getDbDialect } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { qall, qone, qrun } from "../../common/db/query.js";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { runRegistry } from "../agents/runtime/utils/run-registry.js";

/** Orphan "running" rows (process crashed / lost registry) older than this become done. */
const STALE_MS = 15 * 60_000;

export async function listConversations(ownerId: string, query: RawQuery = {}) {
  // Build static WHERE: owner + exclude public/api triggers, optionally filter by agentId
  const agentId = query.agentId;
  const hiddenTriggers = notInArray(agentConversations.trigger, ["public", "api"]);
  const staticWhere = agentId ? and(eq(agentConversations.ownerId, ownerId), eq(agentConversations.agentId, agentId), hiddenTriggers) : and(eq(agentConversations.ownerId, ownerId), hiddenTriggers);

  // Remove agentId from query so listQuery doesn't re-apply it as a column filter
  const { agentId: _, ...cleanQuery } = query;

  const result = await listQuery({ table: agentConversations, where: staticWhere }, cleanQuery);

  // Heal orphan "running" conversations (no live registry entry, last start older than STALE_MS)
  const now = new Date();
  const db = getDb();
  const items = [];
  for (const conv of result.items as any[]) {
    if (conv.status !== "running") {
      items.push(conv);
      continue;
    }
    if (runRegistry.isActive(conv.id)) {
      items.push(conv);
      continue;
    }
    const anchor = conv.startedAt ?? conv.createdAt ?? now;
    const age = now.getTime() - new Date(anchor as Date | string | number).getTime();
    if (age < STALE_MS) {
      items.push(conv);
      continue;
    }
    await qrun(db.update(agentConversations).set({ status: "done", finishedAt: now }).where(eq(agentConversations.id, conv.id)));
    items.push({ ...conv, status: "done" as const, finishedAt: now });
  }
  result.items = items;

  return result;
}

export async function getConversation(id: string) {
  return await qone(getDb().select().from(agentConversations).where(eq(agentConversations.id, id)));
}

/** Ensure conversation exists and belongs to the given owner. */
export async function requireOwnedConversation(id: string, ownerId: string): Promise<AgentConversation> {
  const conv = await getConversation(id);
  if (!conv || conv.trigger === "public") throw new BadRequestException("Not found");
  if (conv.ownerId !== ownerId) throw new ForbiddenException("Forbidden");
  return conv;
}

export async function createConversation(body: {
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
  await qrun(getDb().insert(agentConversations).values(conv));
  wsHub.emit("conversations:created", conv);
  return conv;
}

export async function updateConversation(id: string, body: Partial<Pick<NewAgentConversation, "title" | "status" | "finishedAt" | "errorMessage">>) {
  await qrun(getDb().update(agentConversations).set(body).where(eq(agentConversations.id, id)));
  const updated = await qone(getDb().select().from(agentConversations).where(eq(agentConversations.id, id)));
  wsHub.emit("conversations:updated", updated);
  return updated;
}

export async function deleteConversation(id: string) {
  await qrun(getDb().delete(agentConversations).where(eq(agentConversations.id, id)));
  wsHub.emit("conversations:deleted", { id });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function listMessages(conversationId: string) {
  const orderTiebreak = getDbDialect() === "postgres" ? sql`ctid` : sql`rowid`;
  return (await qall(getDb().select().from(agentMessages).where(eq(agentMessages.conversationId, conversationId)).orderBy(asc(agentMessages.createdAt), orderTiebreak))).filter((r) => !(r.role === "tool" && r.content === ""));
}

export async function createMessage(conversationId: string, body: Omit<NewAgentMessage, "id" | "conversationId" | "createdAt">) {
  const msg: NewAgentMessage = { ...body, id: crypto.randomUUID(), conversationId, createdAt: new Date() };
  await qrun(getDb().insert(agentMessages).values(msg));
  wsHub.emit("messages:created", msg);
  return msg;
}

export async function patchMessageMeta(msgId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const row = await qone(db.select().from(agentMessages).where(eq(agentMessages.id, msgId)));
  if (!row) return null;
  const merged = { ...(row.metadata ?? {}), ...patch };
  await qrun(db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)));
  return { ok: true };
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function getMessageFeed(agentId: string, ownerId: string, cursor?: string) {
  const PAGE = 30;
  const db = getDb();
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const convRows = await qall(
    db
      .select()
      .from(agentConversations)
      .where(and(eq(agentConversations.agentId, agentId), eq(agentConversations.ownerId, ownerId)))
      .orderBy(desc(agentConversations.createdAt)),
  );

  if (convRows.length === 0) return { items: [], hasMore: false };

  const convMap = new Map(convRows.map((conv) => [conv.id, conv]));
  const ownedConvIds = convRows.map((c) => c.id);

  const whereClause = cursorDate ? and(eq(agentMessages.agentId, agentId), inArray(agentMessages.conversationId, ownedConvIds), lt(agentMessages.createdAt, cursorDate)) : and(eq(agentMessages.agentId, agentId), inArray(agentMessages.conversationId, ownedConvIds));

  const msgRows = await qall(
    db
      .select()
      .from(agentMessages)
      .where(whereClause)
      .orderBy(desc(agentMessages.createdAt))
      .limit(PAGE + 1),
  );

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
export async function saveMessage(data: Omit<NewAgentMessage, "id" | "createdAt">): Promise<{ id: string } & NewAgentMessage> {
  const db = getDb();
  const id = crypto.randomUUID();
  const msg = { ...data, id, createdAt: new Date() } as NewAgentMessage;
  await qrun(db.insert(agentMessages).values(msg));
  return { ...msg, id };
}

/**
 * Append suffix to an existing message's content.
 */
export async function appendMessageContent(msgId: string, suffix: string) {
  if (!suffix) return;
  const db = getDb();
  const row = await qone(db.select().from(agentMessages).where(eq(agentMessages.id, msgId)));
  if (!row) return;
  await qrun(
    db
      .update(agentMessages)
      .set({ content: `${row.content ?? ""}${suffix}` })
      .where(eq(agentMessages.id, msgId)),
  );
}

/**
 * Merge patch into message metadata.
 */
export async function patchMessageMetadata(msgId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const row = await qone(db.select().from(agentMessages).where(eq(agentMessages.id, msgId)));
  if (!row) return;
  const merged = { ...(row.metadata ?? {}), ...patch } as Record<string, unknown>;
  await qrun(db.update(agentMessages).set({ metadata: merged }).where(eq(agentMessages.id, msgId)));
}

/**
 * Update conversation status (done/failed) and broadcast via WS.
 */
export async function updateConversationStatus(conversationId: string, data: { status: "done" | "failed"; finishedAt: Date; errorMessage?: string }) {
  const db = getDb();
  await qrun(db.update(agentConversations).set(data).where(eq(agentConversations.id, conversationId)));
  const updated = await qone(db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)));
  if (updated) {
    // Always broadcast to ALL clients so other tabs can update their UI
    wsHub.broadcast("conversations:updated", updated);
  }
}
