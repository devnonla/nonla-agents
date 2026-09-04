import { asc, eq, inArray } from "drizzle-orm";
import { agents, apiKeyAgents, apiKeyDatatableProjects, apiKeyKvEntries, apiKeys, datatableProjects, getDb, kvStore } from "../../common/db/client.js";
import { qall, qone, qrun } from "../../common/db/query.js";
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

async function loadAgentIds(keyId: string): Promise<string[]> {
  return (await qall(getDb().select({ agentId: apiKeyAgents.agentId }).from(apiKeyAgents).where(eq(apiKeyAgents.apiKeyId, keyId)))).map((r) => r.agentId);
}

async function loadDatatableProjectIds(keyId: string): Promise<string[]> {
  return (await qall(getDb().select({ projectId: apiKeyDatatableProjects.projectId }).from(apiKeyDatatableProjects).where(eq(apiKeyDatatableProjects.apiKeyId, keyId)))).map((r) => r.projectId);
}

async function loadKvEntryIds(keyId: string): Promise<string[]> {
  return (await qall(getDb().select({ kvEntryId: apiKeyKvEntries.kvEntryId }).from(apiKeyKvEntries).where(eq(apiKeyKvEntries.apiKeyId, keyId)))).map((r) => r.kvEntryId);
}

async function loadScope(keyId: string) {
  return {
    agentIds: await loadAgentIds(keyId),
    datatableProjectIds: await loadDatatableProjectIds(keyId),
    kvEntryIds: await loadKvEntryIds(keyId),
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

async function toContext(row: typeof apiKeys.$inferSelect): Promise<ApiKeyContext> {
  const scope = await loadScope(row.id);
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

async function assertExistingIds(ids: string[], table: typeof agents | typeof datatableProjects | typeof kvStore, label: string): Promise<string[]> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];
  const found = await qall(getDb().select({ id: table.id }).from(table).where(inArray(table.id, unique)));
  if (found.length !== unique.length) {
    throw new BadRequestException(`One or more ${label} were not found`);
  }
  return unique;
}

async function replaceAgents(keyId: string, agentIds: string[]) {
  const db = getDb();
  await qrun(db.delete(apiKeyAgents).where(eq(apiKeyAgents.apiKeyId, keyId)));
  if (agentIds.length === 0) return;
  await qrun(db.insert(apiKeyAgents).values(agentIds.map((agentId) => ({ apiKeyId: keyId, agentId }))));
}

async function replaceDatatableProjects(keyId: string, projectIds: string[]) {
  const db = getDb();
  await qrun(db.delete(apiKeyDatatableProjects).where(eq(apiKeyDatatableProjects.apiKeyId, keyId)));
  if (projectIds.length === 0) return;
  await qrun(db.insert(apiKeyDatatableProjects).values(projectIds.map((projectId) => ({ apiKeyId: keyId, projectId }))));
}

async function replaceKvEntries(keyId: string, kvEntryIds: string[]) {
  const db = getDb();
  await qrun(db.delete(apiKeyKvEntries).where(eq(apiKeyKvEntries.apiKeyId, keyId)));
  if (kvEntryIds.length === 0) return;
  await qrun(db.insert(apiKeyKvEntries).values(kvEntryIds.map((kvEntryId) => ({ apiKeyId: keyId, kvEntryId }))));
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

export async function listApiKeys(): Promise<{ items: ApiKeyMeta[]; total: number }> {
  const rows = await qall(getDb().select().from(apiKeys));
  const items = [];
  for (const row of rows) {
    items.push(toMeta(row, await loadScope(row.id)));
  }
  return { items, total: items.length };
}

export async function createApiKey(body: ApiKeyWriteBody & { name: string; createdBy: string }): Promise<ApiKeyMeta & { key: string }> {
  const name = body.name?.trim() ?? "";
  if (!name) throw new BadRequestException("name is required");
  const agentIds = await assertExistingIds(body.agentIds ?? [], agents, "agents");
  const datatableProjectIds = await assertExistingIds(body.datatableProjectIds ?? [], datatableProjects, "datatable projects");
  const kvEntryIds = await assertExistingIds(body.kvEntryIds ?? [], kvStore, "KV entries");
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
  await qrun(getDb().insert(apiKeys).values(row));
  await replaceAgents(row.id, agentIds);
  await replaceDatatableProjects(row.id, datatableProjectIds);
  await replaceKvEntries(row.id, kvEntryIds);
  return { ...toMeta(row, { agentIds, datatableProjectIds, kvEntryIds }), key: raw };
}

export async function updateApiKey(id: string, body: ApiKeyWriteBody): Promise<ApiKeyMeta> {
  const existing = await qone(getDb().select().from(apiKeys).where(eq(apiKeys.id, id)));
  if (!existing) throw new BadRequestException("API key not found");

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) throw new BadRequestException("name is required");

  const patch: { name?: string; agentsUnrestricted?: boolean; datatablesUnrestricted?: boolean; kvUnrestricted?: boolean } = {};
  if (body.name !== undefined) patch.name = name;
  if (body.agentsUnrestricted !== undefined) patch.agentsUnrestricted = Boolean(body.agentsUnrestricted);
  if (body.datatablesUnrestricted !== undefined) patch.datatablesUnrestricted = Boolean(body.datatablesUnrestricted);
  if (body.kvUnrestricted !== undefined) patch.kvUnrestricted = Boolean(body.kvUnrestricted);
  if (Object.keys(patch).length > 0) {
    await qrun(getDb().update(apiKeys).set(patch).where(eq(apiKeys.id, id)));
  }

  let agentIds = await loadAgentIds(id);
  if (body.agentIds !== undefined) {
    agentIds = await assertExistingIds(body.agentIds, agents, "agents");
    await replaceAgents(id, agentIds);
  }
  let datatableProjectIds = await loadDatatableProjectIds(id);
  if (body.datatableProjectIds !== undefined) {
    datatableProjectIds = await assertExistingIds(body.datatableProjectIds, datatableProjects, "datatable projects");
    await replaceDatatableProjects(id, datatableProjectIds);
  }
  let kvEntryIds = await loadKvEntryIds(id);
  if (body.kvEntryIds !== undefined) {
    kvEntryIds = await assertExistingIds(body.kvEntryIds, kvStore, "KV entries");
    await replaceKvEntries(id, kvEntryIds);
  }

  const updated = (await qone(getDb().select().from(apiKeys).where(eq(apiKeys.id, id)))) ?? { ...existing, name };
  return toMeta(updated, { agentIds, datatableProjectIds, kvEntryIds });
}

export async function revokeApiKey(id: string): Promise<ApiKeyMeta> {
  const existing = await qone(getDb().select().from(apiKeys).where(eq(apiKeys.id, id)));
  if (!existing) throw new BadRequestException("API key not found");
  if (!existing.revokedAt) {
    await qrun(getDb().update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)));
  }
  const updated = (await qone(getDb().select().from(apiKeys).where(eq(apiKeys.id, id)))) ?? existing;
  return toMeta(updated, await loadScope(id));
}

export async function deleteApiKey(id: string) {
  const existing = await qone(getDb().select().from(apiKeys).where(eq(apiKeys.id, id)));
  if (!existing) throw new BadRequestException("API key not found");
  await qrun(getDb().delete(apiKeys).where(eq(apiKeys.id, id)));
}

export async function authenticateApiKey(raw: string): Promise<ApiKeyContext | null> {
  if (!raw.startsWith("ra_")) return null;
  const row = await qone(
    getDb()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(raw))),
  );
  if (!row || row.revokedAt) return null;
  await qrun(getDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)));
  return await toContext(row);
}

export function apiConversationOwnerId(apiKeyId: string): string {
  return `api:${apiKeyId}`;
}

export async function listAccessibleAgents(apiKey: ApiKeyContext) {
  const select = {
    id: agents.id,
    name: agents.name,
    description: agents.description,
    avatar: agents.avatar,
  };
  if (apiKey.agentsUnrestricted) {
    return { items: await qall(getDb().select(select).from(agents).orderBy(asc(agents.name))) };
  }
  if (apiKey.agentIds.length === 0) return { items: [] as { id: string; name: string; description: string | null; avatar: string | null }[] };
  const rows = await qall(getDb().select(select).from(agents).where(inArray(agents.id, apiKey.agentIds)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return { items: apiKey.agentIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row) };
}
