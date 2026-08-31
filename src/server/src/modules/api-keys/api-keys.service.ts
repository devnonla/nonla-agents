import { asc, eq, inArray } from "drizzle-orm";
import { agents, apiKeyAgents, apiKeyDatatableProjects, apiKeyKvEntries, apiKeys, datatableProjects, getDb, kvStore } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";

const KEY_PREFIX_LEN = 12;

export type ApiKeyMeta = {
  id: string;
  name: string;
  keyPrefix: string;
  agentIds: string[];
  agentsUnrestricted: boolean;
  datatablesUnrestricted: boolean;
  datatableProjectIds: string[];
  kvUnrestricted: boolean;
  kvEntryIds: string[];
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type ApiKeyContext = {
  id: string;
  createdBy: string;
  agentIds: string[];
  agentsUnrestricted: boolean;
  datatablesUnrestricted: boolean;
  datatableProjectIds: string[];
  kvUnrestricted: boolean;
  kvEntryIds: string[];
};

export type ApiKeyWriteBody = {
  name?: string;
  agentIds?: string[];
  agentsUnrestricted?: boolean;
  datatablesUnrestricted?: boolean;
  datatableProjectIds?: string[];
  kvUnrestricted?: boolean;
  kvEntryIds?: string[];
};

function hashApiKey(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ra_${hex}`;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

function loadAgentIds(keyId: string): string[] {
  return getDb()
    .select({ agentId: apiKeyAgents.agentId })
    .from(apiKeyAgents)
    .where(eq(apiKeyAgents.apiKeyId, keyId))
    .all()
    .map((r) => r.agentId);
}

function loadDatatableProjectIds(keyId: string): string[] {
  return getDb()
    .select({ projectId: apiKeyDatatableProjects.projectId })
    .from(apiKeyDatatableProjects)
    .where(eq(apiKeyDatatableProjects.apiKeyId, keyId))
    .all()
    .map((r) => r.projectId);
}

function loadKvEntryIds(keyId: string): string[] {
  return getDb()
    .select({ kvEntryId: apiKeyKvEntries.kvEntryId })
    .from(apiKeyKvEntries)
    .where(eq(apiKeyKvEntries.apiKeyId, keyId))
    .all()
    .map((r) => r.kvEntryId);
}

function loadScope(keyId: string) {
  return {
    agentIds: loadAgentIds(keyId),
    datatableProjectIds: loadDatatableProjectIds(keyId),
    kvEntryIds: loadKvEntryIds(keyId),
  };
}

function toMeta(row: typeof apiKeys.$inferSelect, scope: { agentIds: string[]; datatableProjectIds: string[]; kvEntryIds: string[] }): ApiKeyMeta {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    agentIds: scope.agentIds,
    agentsUnrestricted: Boolean(row.agentsUnrestricted),
    datatablesUnrestricted: Boolean(row.datatablesUnrestricted),
    datatableProjectIds: scope.datatableProjectIds,
    kvUnrestricted: Boolean(row.kvUnrestricted),
    kvEntryIds: scope.kvEntryIds,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

function toContext(row: typeof apiKeys.$inferSelect): ApiKeyContext {
  const scope = loadScope(row.id);
  return {
    id: row.id,
    createdBy: row.createdBy,
    agentIds: scope.agentIds,
    agentsUnrestricted: Boolean(row.agentsUnrestricted),
    datatablesUnrestricted: Boolean(row.datatablesUnrestricted),
    datatableProjectIds: scope.datatableProjectIds,
    kvUnrestricted: Boolean(row.kvUnrestricted),
    kvEntryIds: scope.kvEntryIds,
  };
}

function assertExistingIds(ids: string[], table: typeof agents | typeof datatableProjects | typeof kvStore, label: string): string[] {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];
  const found = getDb().select({ id: table.id }).from(table).where(inArray(table.id, unique)).all();
  if (found.length !== unique.length) {
    throw new BadRequestException(`One or more ${label} were not found`);
  }
  return unique;
}

function replaceAgents(keyId: string, agentIds: string[]) {
  const db = getDb();
  db.delete(apiKeyAgents).where(eq(apiKeyAgents.apiKeyId, keyId)).run();
  if (agentIds.length === 0) return;
  db.insert(apiKeyAgents)
    .values(agentIds.map((agentId) => ({ apiKeyId: keyId, agentId })))
    .run();
}

function replaceDatatableProjects(keyId: string, projectIds: string[]) {
  const db = getDb();
  db.delete(apiKeyDatatableProjects).where(eq(apiKeyDatatableProjects.apiKeyId, keyId)).run();
  if (projectIds.length === 0) return;
  db.insert(apiKeyDatatableProjects)
    .values(projectIds.map((projectId) => ({ apiKeyId: keyId, projectId })))
    .run();
}

function replaceKvEntries(keyId: string, kvEntryIds: string[]) {
  const db = getDb();
  db.delete(apiKeyKvEntries).where(eq(apiKeyKvEntries.apiKeyId, keyId)).run();
  if (kvEntryIds.length === 0) return;
  db.insert(apiKeyKvEntries)
    .values(kvEntryIds.map((kvEntryId) => ({ apiKeyId: keyId, kvEntryId })))
    .run();
}

export function canAccessAgent(apiKey: ApiKeyContext, agentId: string): boolean {
  return apiKey.agentsUnrestricted || apiKey.agentIds.includes(agentId);
}

export function canAccessDatatable(apiKey: ApiKeyContext, projectId: string): boolean {
  return apiKey.datatablesUnrestricted || apiKey.datatableProjectIds.includes(projectId);
}

export function canAccessKvEntry(apiKey: ApiKeyContext, entryId: string): boolean {
  return apiKey.kvUnrestricted || apiKey.kvEntryIds.includes(entryId);
}

export function listApiKeys(): { items: ApiKeyMeta[]; total: number } {
  const rows = getDb().select().from(apiKeys).all();
  const items = rows.map((row) => toMeta(row, loadScope(row.id)));
  return { items, total: items.length };
}

export function createApiKey(body: ApiKeyWriteBody & { name: string; createdBy: string }): ApiKeyMeta & { key: string } {
  const name = body.name?.trim() ?? "";
  if (!name) throw new BadRequestException("name is required");
  const agentIds = assertExistingIds(body.agentIds ?? [], agents, "agents");
  const datatableProjectIds = assertExistingIds(body.datatableProjectIds ?? [], datatableProjects, "datatable projects");
  const kvEntryIds = assertExistingIds(body.kvEntryIds ?? [], kvStore, "KV entries");
  const agentsUnrestricted = Boolean(body.agentsUnrestricted);
  const datatablesUnrestricted = Boolean(body.datatablesUnrestricted);
  const kvUnrestricted = Boolean(body.kvUnrestricted);

  const raw = generateRawKey();
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name,
    keyPrefix: raw.slice(0, KEY_PREFIX_LEN),
    keyHash: hashApiKey(raw),
    createdBy: body.createdBy,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    agentsUnrestricted,
    datatablesUnrestricted,
    kvUnrestricted,
  };
  getDb().insert(apiKeys).values(row).run();
  replaceAgents(row.id, agentIds);
  replaceDatatableProjects(row.id, datatableProjectIds);
  replaceKvEntries(row.id, kvEntryIds);
  return { ...toMeta(row, { agentIds, datatableProjectIds, kvEntryIds }), key: raw };
}

export function updateApiKey(id: string, body: ApiKeyWriteBody): ApiKeyMeta {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) throw new BadRequestException("name is required");

  const patch: { name?: string; agentsUnrestricted?: boolean; datatablesUnrestricted?: boolean; kvUnrestricted?: boolean } = {};
  if (body.name !== undefined) patch.name = name;
  if (body.agentsUnrestricted !== undefined) patch.agentsUnrestricted = Boolean(body.agentsUnrestricted);
  if (body.datatablesUnrestricted !== undefined) patch.datatablesUnrestricted = Boolean(body.datatablesUnrestricted);
  if (body.kvUnrestricted !== undefined) patch.kvUnrestricted = Boolean(body.kvUnrestricted);
  if (Object.keys(patch).length > 0) {
    getDb().update(apiKeys).set(patch).where(eq(apiKeys.id, id)).run();
  }

  let agentIds = loadAgentIds(id);
  if (body.agentIds !== undefined) {
    agentIds = assertExistingIds(body.agentIds, agents, "agents");
    replaceAgents(id, agentIds);
  }
  let datatableProjectIds = loadDatatableProjectIds(id);
  if (body.datatableProjectIds !== undefined) {
    datatableProjectIds = assertExistingIds(body.datatableProjectIds, datatableProjects, "datatable projects");
    replaceDatatableProjects(id, datatableProjectIds);
  }
  let kvEntryIds = loadKvEntryIds(id);
  if (body.kvEntryIds !== undefined) {
    kvEntryIds = assertExistingIds(body.kvEntryIds, kvStore, "KV entries");
    replaceKvEntries(id, kvEntryIds);
  }

  const updated = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get() ?? { ...existing, name };
  return toMeta(updated, { agentIds, datatableProjectIds, kvEntryIds });
}

export function revokeApiKey(id: string): ApiKeyMeta {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");
  if (!existing.revokedAt) {
    getDb().update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)).run();
  }
  const updated = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get() ?? existing;
  return toMeta(updated, loadScope(id));
}

export function deleteApiKey(id: string) {
  const existing = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw new BadRequestException("API key not found");
  getDb().delete(apiKeys).where(eq(apiKeys.id, id)).run();
}

export function authenticateApiKey(raw: string): ApiKeyContext | null {
  if (!raw.startsWith("ra_")) return null;
  const row = getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(raw)))
    .get();
  if (!row || row.revokedAt) return null;
  getDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).run();
  return toContext(row);
}

export function apiConversationOwnerId(apiKeyId: string): string {
  return `api:${apiKeyId}`;
}

export function listAccessibleAgents(apiKey: ApiKeyContext) {
  const select = {
    id: agents.id,
    name: agents.name,
    description: agents.description,
    avatar: agents.avatar,
  };
  if (apiKey.agentsUnrestricted) {
    return { items: getDb().select(select).from(agents).orderBy(asc(agents.name)).all() };
  }
  if (apiKey.agentIds.length === 0) return { items: [] as { id: string; name: string; description: string | null; avatar: string | null }[] };
  const rows = getDb().select(select).from(agents).where(inArray(agents.id, apiKey.agentIds)).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return { items: apiKey.agentIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row) };
}
