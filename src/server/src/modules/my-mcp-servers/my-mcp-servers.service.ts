/**
 * my-mcp-servers.service.ts — CRUD for MCP servers we host (Cursor / Claude Code).
 */

import { and, count, eq, inArray } from "drizzle-orm";
import { agentTools, getDb, myMcpServerTools, myMcpServers } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";

const KEY_PREFIX_LEN = 12;

export type MyMcpServerListItem = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  toolCount: number;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MyMcpServerToolInfo = {
  id: string;
  name: string;
  label: string;
  description: string;
};

export type MyMcpServerDetail = MyMcpServerListItem & {
  tools: MyMcpServerToolInfo[];
};

export type MyMcpServerWriteBody = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  toolIds?: string[];
};

function hashMcpKey(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ra_mcp_${hex}`;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

function assertCustomToolIds(ids: string[]): string[] {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];
  for (const id of unique) {
    if (id.startsWith("builtin:") || id.startsWith("mcp:")) {
      throw new BadRequestException("Only custom tools can be assigned");
    }
  }
  const found = getDb().select({ id: agentTools.id }).from(agentTools).where(inArray(agentTools.id, unique)).all();
  if (found.length !== unique.length) {
    throw new BadRequestException("One or more tools were not found");
  }
  return unique;
}

function replaceTools(serverId: string, toolIds: string[]) {
  const db = getDb();
  db.delete(myMcpServerTools).where(eq(myMcpServerTools.serverId, serverId)).run();
  if (toolIds.length === 0) return;
  db.insert(myMcpServerTools)
    .values(toolIds.map((toolId) => ({ serverId, toolId })))
    .run();
}

function loadToolCountMap(serverIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (serverIds.length === 0) return map;
  const rows = getDb().select({ serverId: myMcpServerTools.serverId, n: count() }).from(myMcpServerTools).where(inArray(myMcpServerTools.serverId, serverIds)).groupBy(myMcpServerTools.serverId).all();
  for (const row of rows) map.set(row.serverId, Number(row.n));
  return map;
}

function loadToolCount(serverId: string): number {
  const row = getDb().select({ n: count() }).from(myMcpServerTools).where(eq(myMcpServerTools.serverId, serverId)).get();
  return Number(row?.n ?? 0);
}

function toListItem(row: typeof myMcpServers.$inferSelect, toolCount: number): MyMcpServerListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    isActive: Boolean(row.isActive),
    toolCount,
    keyPrefix: row.keyPrefix,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadAssignedTools(serverId: string): MyMcpServerToolInfo[] {
  return getDb()
    .select({
      id: agentTools.id,
      name: agentTools.name,
      label: agentTools.label,
      description: agentTools.description,
    })
    .from(myMcpServerTools)
    .innerJoin(agentTools, eq(myMcpServerTools.toolId, agentTools.id))
    .where(eq(myMcpServerTools.serverId, serverId))
    .all();
}

export function listMyMcpServers(query: RawQuery = {}) {
  const result = listQuery({ table: myMcpServers, searchColumns: ["name", "description"] }, query);
  const items = result.items as (typeof myMcpServers.$inferSelect)[];
  const counts = loadToolCountMap(items.map((row) => row.id));
  return {
    ...result,
    items: items.map((row) => toListItem(row, counts.get(row.id) ?? 0)),
  };
}

export function getMyMcpServer(id: string): MyMcpServerDetail {
  const row = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get();
  if (!row) throw new NotFoundException("MCP server not found");
  return { ...toListItem(row, loadToolCount(id)), tools: loadAssignedTools(id) };
}

export function createMyMcpServer(body: MyMcpServerWriteBody): MyMcpServerListItem & { key: string } {
  const name = body.name?.trim() ?? "";
  if (!name) throw new BadRequestException("name is required");
  const toolIds = assertCustomToolIds(body.toolIds ?? []);
  const raw = generateRawKey();
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name,
    description: body.description?.trim() || null,
    isActive: body.isActive !== false,
    keyPrefix: raw.slice(0, KEY_PREFIX_LEN),
    keyHash: hashMcpKey(raw),
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(myMcpServers).values(row).run();
  replaceTools(row.id, toolIds);
  const item = toListItem(row, toolIds.length);
  wsHub.emit("my-mcp-servers:created", item);
  return { ...item, key: raw };
}

export function updateMyMcpServer(id: string, body: MyMcpServerWriteBody): MyMcpServerListItem {
  const existing = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get();
  if (!existing) throw new NotFoundException("MCP server not found");

  const patch: Partial<typeof myMcpServers.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) throw new BadRequestException("name is required");
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

  getDb().update(myMcpServers).set(patch).where(eq(myMcpServers.id, id)).run();

  if (body.toolIds !== undefined) {
    replaceTools(id, assertCustomToolIds(body.toolIds));
  }

  const updated = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get() ?? existing;
  const item = toListItem(updated, loadToolCount(id));
  wsHub.emit("my-mcp-servers:updated", item);
  return item;
}

export function rotateMyMcpServerKey(id: string): MyMcpServerListItem & { key: string } {
  const existing = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get();
  if (!existing) throw new NotFoundException("MCP server not found");
  const raw = generateRawKey();
  getDb()
    .update(myMcpServers)
    .set({
      keyPrefix: raw.slice(0, KEY_PREFIX_LEN),
      keyHash: hashMcpKey(raw),
      updatedAt: new Date(),
    })
    .where(eq(myMcpServers.id, id))
    .run();
  const updated = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get() ?? existing;
  const item = toListItem(updated, loadToolCount(id));
  wsHub.emit("my-mcp-servers:updated", item);
  return { ...item, key: raw };
}

export function deleteMyMcpServer(id: string) {
  const existing = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get();
  if (!existing) throw new NotFoundException("MCP server not found");
  getDb().delete(myMcpServers).where(eq(myMcpServers.id, id)).run();
  wsHub.emit("my-mcp-servers:deleted", { id });
}

export type AuthenticatedMyMcpServer = typeof myMcpServers.$inferSelect;

export function authenticateMyMcpServer(id: string, rawKey: string): AuthenticatedMyMcpServer | "missing" | "unauthorized" | "inactive" {
  const row = getDb().select().from(myMcpServers).where(eq(myMcpServers.id, id)).get();
  if (!row) return "missing";
  if (row.keyHash !== hashMcpKey(rawKey)) return "unauthorized";
  if (!row.isActive) return "inactive";
  getDb().update(myMcpServers).set({ lastUsedAt: new Date() }).where(eq(myMcpServers.id, id)).run();
  return row;
}

export type LiveMcpTool = {
  name: string;
  description: string;
  inputSchema: object;
  id: string;
  codeContent: string;
  isActive: boolean;
};

export function listLiveMcpTools(serverId: string): LiveMcpTool[] {
  const rows = getDb()
    .select({
      id: agentTools.id,
      name: agentTools.name,
      description: agentTools.description,
      parameters: agentTools.parameters,
      codeContent: agentTools.codeContent,
      isActive: agentTools.isActive,
    })
    .from(myMcpServerTools)
    .innerJoin(agentTools, eq(myMcpServerTools.toolId, agentTools.id))
    .where(and(eq(myMcpServerTools.serverId, serverId), eq(agentTools.isActive, true)))
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    inputSchema: (row.parameters ?? { type: "object", properties: {} }) as object,
    codeContent: row.codeContent,
    isActive: Boolean(row.isActive),
  }));
}

export function getAssignedToolForCall(serverId: string, toolName: string): LiveMcpTool | null {
  const row = getDb()
    .select({
      id: agentTools.id,
      name: agentTools.name,
      description: agentTools.description,
      parameters: agentTools.parameters,
      codeContent: agentTools.codeContent,
      isActive: agentTools.isActive,
    })
    .from(myMcpServerTools)
    .innerJoin(agentTools, eq(myMcpServerTools.toolId, agentTools.id))
    .where(and(eq(myMcpServerTools.serverId, serverId), eq(agentTools.name, toolName)))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inputSchema: (row.parameters ?? { type: "object", properties: {} }) as object,
    codeContent: row.codeContent,
    isActive: Boolean(row.isActive),
  };
}
