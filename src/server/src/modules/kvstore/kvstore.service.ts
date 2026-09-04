import { eq } from "drizzle-orm";
import { type NewKvStoreEntry, getDb, kvStore } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { qall, qone, qrun } from "../../common/db/query.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

function assertKey(key: string) {
  if (!KEY_RE.test(key)) {
    throw new BadRequestException("Key must match [A-Z][A-Z0-9_]* (e.g. BASE_URL)");
  }
}

export async function listKvEntries(query: RawQuery = {}) {
  return await listQuery({ table: kvStore, searchColumns: ["key", "value", "description"] }, query);
}

export async function getKvEntry(id: string) {
  return (await qone(getDb().select().from(kvStore).where(eq(kvStore.id, id)))) ?? null;
}

export async function getKvByKey(key: string) {
  return (await qone(getDb().select().from(kvStore).where(eq(kvStore.key, key)))) ?? null;
}

/** Upsert by key — create or update value. */
export async function upsertKvByKey(body: { key: string; value: string }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string") {
    throw new BadRequestException("value is required");
  }

  const existing = await getKvByKey(key);
  if (existing) {
    return await updateKvEntry(existing.id, { value: body.value });
  }
  return await createKvEntry({ key, value: body.value });
}

export async function deleteKvByKey(key: string) {
  const existing = await getKvByKey(key);
  if (!existing) throw new BadRequestException(`Key "${key}" not found`);
  await deleteKvEntry(existing.id);
  return { key };
}

export async function createKvEntry(body: { key: string; value: string; description?: string | null }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string") {
    throw new BadRequestException("value is required");
  }

  const db = getDb();
  const existing = await qone(db.select().from(kvStore).where(eq(kvStore.key, key)));
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
  await qrun(db.insert(kvStore).values(entry));
  wsHub.emit("kvstore:created", entry);
  return entry;
}

export async function updateKvEntry(id: string, body: { key?: string; value?: string; description?: string | null }) {
  const current = await getKvEntry(id);
  if (!current) throw new BadRequestException("KV entry not found");

  const nextKey = body.key !== undefined ? body.key.trim() : current.key;
  assertKey(nextKey);

  if (nextKey !== current.key) {
    const clash = await qone(getDb().select().from(kvStore).where(eq(kvStore.key, nextKey)));
    if (clash) throw new BadRequestException(`Key "${nextKey}" already exists`);
  }

  const updatedAt = new Date();
  await qrun(
    getDb()
      .update(kvStore)
      .set({
        key: nextKey,
        value: body.value !== undefined ? body.value : current.value,
        description: body.description !== undefined ? body.description?.trim() || null : current.description,
        updatedAt,
      })
      .where(eq(kvStore.id, id)),
  );

  const updated = await getKvEntry(id);
  wsHub.emit("kvstore:updated", updated);
  return updated;
}

export async function deleteKvEntry(id: string) {
  const current = await getKvEntry(id);
  if (!current) throw new BadRequestException("KV entry not found");
  await qrun(getDb().delete(kvStore).where(eq(kvStore.id, id)));
  wsHub.emit("kvstore:deleted", { id });
}

/** Internal — map for tool runtime ctx.kv */
export async function loadKvMap(): Promise<Record<string, string>> {
  const rows = await qall(getDb().select({ key: kvStore.key, value: kvStore.value }).from(kvStore));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
