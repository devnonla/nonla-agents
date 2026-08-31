/**
 * mcp-servers.service.ts — CRUD + sync for MCP servers.
 *
 * Sync flow:
 *   1. Connect to MCP server via URL + headers
 *   2. Call listTools to discover available tools
 *   3. Store catalog on mcp_servers.tools (JSON)
 *   4. Remove stale agent assignments for tools that disappeared
 */

import { eq, like } from "drizzle-orm";
import { type McpCatalogTool, type NewMcpServer, agentToolAssignments, getDb, mcpServers } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { type McpToolDef, disconnectMcp, listMcpTools } from "./mcp-client.js";
import { mergeHeaders, toSafeMcpServer } from "./mcp-safe.js";
import { buildMcpToolId } from "./mcp-tool-id.js";
import { assertSafeMcpUrl } from "./mcp-url.js";

function toCatalogTools(remoteDefs: McpToolDef[]): McpCatalogTool[] {
  return remoteDefs.map((d) => ({
    name: d.name,
    description: d.description || "",
    inputSchema: d.inputSchema,
  }));
}

function syncCatalogForServer(serverId: string, remoteDefs: McpToolDef[]): SyncResult {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (!server) throw new Error("MCP server not found");

  const previous = (server.tools ?? []) as McpCatalogTool[];
  const previousNames = new Set(previous.map((t) => t.name));
  const next = toCatalogTools(remoteDefs);
  const nextNames = new Set(next.map((t) => t.name));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const tool of next) {
    if (previousNames.has(tool.name)) updated++;
    else added++;
  }

  for (const name of previousNames) {
    if (!nextNames.has(name)) {
      db.delete(agentToolAssignments)
        .where(eq(agentToolAssignments.toolId, buildMcpToolId(serverId, name)))
        .run();
      removed++;
    }
  }

  db.update(mcpServers).set({ tools: next, lastSyncError: null, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(mcpServers.id, serverId)).run();

  const updatedServer = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (updatedServer) {
    wsHub.emit("mcp-servers:updated", toSafeMcpServer({ ...updatedServer, toolCount: next.length }));
  }

  return {
    added,
    updated,
    removed,
    tools: next.map((t) => t.name),
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listMcpServers(query: RawQuery = {}) {
  const result = listQuery({ table: mcpServers, searchColumns: ["name", "url"] }, query);
  const items = result.items.map((server: (typeof result.items)[number]) => {
    const tools = (server.tools ?? []) as McpCatalogTool[];
    return toSafeMcpServer({ ...server, toolCount: tools.length, tools });
  });
  return { ...result, items };
}

export function getMcpServer(id: string) {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!server) return null;
  const tools = (server.tools ?? []) as McpCatalogTool[];
  return toSafeMcpServer({ ...server, tools });
}

export async function createMcpServer(body: Pick<NewMcpServer, "name" | "url" | "headers">) {
  await assertSafeMcpUrl(body.url);

  const db = getDb();
  const now = new Date();
  const server: NewMcpServer = {
    id: crypto.randomUUID(),
    name: body.name,
    url: body.url,
    headers: body.headers ?? {},
    tools: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(mcpServers).values(server).run();
  const safe = toSafeMcpServer({ ...server, toolCount: 0, tools: [] });
  wsHub.emit("mcp-servers:created", safe);
  return safe;
}

export async function updateMcpServer(id: string, body: Partial<NewMcpServer>) {
  const db = getDb();
  const existing = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!existing) return null;

  if (body.url) {
    await assertSafeMcpUrl(body.url);
  }

  const patch: Partial<NewMcpServer> = { ...body };
  delete patch.tools;
  if (body.headers) {
    patch.headers = mergeHeaders((existing.headers ?? {}) as Record<string, string>, body.headers);
  }

  db.update(mcpServers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(mcpServers.id, id))
    .run();

  if (body.url || body.headers) {
    await disconnectMcp(existing.id);
  }

  const updated = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!updated) return null;

  const tools = (updated.tools ?? []) as McpCatalogTool[];
  const safe = toSafeMcpServer({ ...updated, toolCount: tools.length, tools });
  wsHub.emit("mcp-servers:updated", safe);
  return safe;
}

export async function deleteMcpServer(id: string) {
  const db = getDb();

  await disconnectMcp(id);

  db.delete(agentToolAssignments)
    .where(like(agentToolAssignments.toolId, `mcp:${id}:%`))
    .run();
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
  wsHub.emit("mcp-servers:deleted", { id });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  tools: string[];
}

/** Sync tools from an MCP server into mcp_servers.tools JSON catalog. */
export async function syncMcpTools(serverId: string): Promise<SyncResult> {
  const db = getDb();
  const server = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (!server) throw new Error("MCP server not found");
  if (!server.isActive) throw new Error("MCP server is inactive");

  await disconnectMcp(serverId);

  try {
    const remoteDefs = await listMcpTools(serverId, server.url, (server.headers ?? {}) as Record<string, string>);
    return syncCatalogForServer(serverId, remoteDefs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date();
    db.update(mcpServers).set({ isActive: false, lastSyncError: message, lastSyncedAt: now, updatedAt: now }).where(eq(mcpServers.id, serverId)).run();
    await disconnectMcp(serverId);

    const updated = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
    if (updated) {
      const tools = (updated.tools ?? []) as McpCatalogTool[];
      wsHub.emit("mcp-servers:updated", toSafeMcpServer({ ...updated, toolCount: tools.length, tools }));
    }

    throw err;
  }
}
