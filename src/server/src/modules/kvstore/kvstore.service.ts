import { eq } from "drizzle-orm";
import { type NewKvStoreEntry, getDb, kvStore } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

function assertKey(key: string) {
  if (!KEY_RE.test(key)) {
    throw new BadRequestException("Key must match [A-Z][A-Z0-9_]* (e.g. BASE_URL)");
  }
}

export function listKvEntries(query: RawQuery = {}) {
  return listQuery({ table: kvStore, searchColumns: ["key", "value", "description"] }, query);
}

export function getKvEntry(id: string) {
  return getDb().select().from(kvStore).where(eq(kvStore.id, id)).get() ?? null;
}

export function getKvByKey(key: string) {
  return getDb().select().from(kvStore).where(eq(kvStore.key, key)).get() ?? null;
}

/** Upsert by key — create or update value. */
export function upsertKvByKey(body: { key: string; value: string }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string") {
    throw new BadRequestException("value is required");
  }

  const existing = getKvByKey(key);
  if (existing) {
    return updateKvEntry(existing.id, { value: body.value });
  }
  return createKvEntry({ key, value: body.value });
}

export function deleteKvByKey(key: string) {
  const existing = getKvByKey(key);
  if (!existing) throw new BadRequestException(`Key "${key}" not found`);
  deleteKvEntry(existing.id);
  return { key };
}

export function createKvEntry(body: { key: string; value: string; description?: string | null }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string") {
    throw new BadRequestException("value is required");
  }

  const db = getDb();
  const existing = db.select().from(kvStore).where(eq(kvStore.key, key)).get();
  if (existing) throw new BadRequestException(`Key "${key}" already exists`);

  const now = new Date();
  const entry: NewKvStoreEntry = {
    id: crypto.randomUUID(),
    key,
    value: body.value,
    description: body.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(kvStore).values(entry).run();
  wsHub.emit("kvstore:created", entry);
  return entry;
}

export function updateKvEntry(id: string, body: { key?: string; value?: string; description?: string | null }) {
  const current = getKvEntry(id);
  if (!current) throw new BadRequestException("KV entry not found");

  const nextKey = body.key !== undefined ? body.key.trim() : current.key;
  assertKey(nextKey);

  if (nextKey !== current.key) {
    const clash = getDb().select().from(kvStore).where(eq(kvStore.key, nextKey)).get();
    if (clash) throw new BadRequestException(`Key "${nextKey}" already exists`);
  }

  const updatedAt = new Date();
  getDb()
    .update(kvStore)
    .set({
      key: nextKey,
      value: body.value !== undefined ? body.value : current.value,
      description: body.description !== undefined ? body.description?.trim() || null : current.description,
      updatedAt,
    })
    .where(eq(kvStore.id, id))
    .run();

  const updated = getKvEntry(id);
  wsHub.emit("kvstore:updated", updated);
  return updated;
}

export function deleteKvEntry(id: string) {
  const current = getKvEntry(id);
  if (!current) throw new BadRequestException("KV entry not found");
  getDb().delete(kvStore).where(eq(kvStore.id, id)).run();
  wsHub.emit("kvstore:deleted", { id });
}

/** Internal — map for tool runtime ctx.kv */
export function loadKvMap(): Record<string, string> {
  const rows = getDb().select({ key: kvStore.key, value: kvStore.value }).from(kvStore).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
