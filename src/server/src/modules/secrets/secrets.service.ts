import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../common/crypto/secret-crypto.js";
import { type NewSecretEntry, getDb, secrets } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export type SecretMeta = {
  id: string;
  key: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function assertKey(key: string) {
  if (!KEY_RE.test(key)) {
    throw new BadRequestException("Key must match [A-Z][A-Z0-9_]* (e.g. API_TOKEN)");
  }
}

function toMeta(row: { id: string; key: string; description: string | null; createdAt: Date; updatedAt: Date }): SecretMeta {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listSecrets(query: RawQuery = {}) {
  const result = listQuery({ table: secrets, searchColumns: ["key", "description"] }, query);
  return {
    ...result,
    items: (result.items as (typeof secrets.$inferSelect)[]).map(toMeta),
  };
}

export function getSecretMeta(id: string): SecretMeta | null {
  const row = getDb().select().from(secrets).where(eq(secrets.id, id)).get();
  return row ? toMeta(row) : null;
}

export function getSecretMetaByKey(key: string): SecretMeta | null {
  const row = getDb().select().from(secrets).where(eq(secrets.key, key)).get();
  return row ? toMeta(row) : null;
}

/** Decrypt a single secret by key. Returns null if missing. */
export function getSecretValueByKey(key: string): string | null {
  const row = getDb().select().from(secrets).where(eq(secrets.key, key)).get();
  if (!row) return null;
  return decryptSecret(row.value);
}

/** Upsert by key — create or rotate value. */
export function upsertSecretByKey(body: { key: string; value: string }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string" || body.value.length === 0) {
    throw new BadRequestException("value is required");
  }

  const existing = getSecretMetaByKey(key);
  if (existing) {
    return updateSecret(existing.id, { value: body.value });
  }
  return createSecret({ key, value: body.value });
}

export function deleteSecretByKey(key: string) {
  const existing = getSecretMetaByKey(key);
  if (!existing) throw new BadRequestException(`Key "${key}" not found`);
  deleteSecret(existing.id);
  return { key };
}

export function createSecret(body: { key: string; value: string; description?: string | null }) {
  const key = body.key?.trim() ?? "";
  assertKey(key);
  if (typeof body.value !== "string" || body.value.length === 0) {
    throw new BadRequestException("value is required");
  }

  const db = getDb();
  const existing = db.select().from(secrets).where(eq(secrets.key, key)).get();
  if (existing) throw new BadRequestException(`Key "${key}" already exists`);

  const now = new Date();
  const entry: NewSecretEntry = {
    id: crypto.randomUUID(),
    key,
    value: encryptSecret(body.value),
    description: body.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(secrets).values(entry).run();
  const meta = toMeta({
    id: entry.id!,
    key: entry.key,
    description: entry.description ?? null,
    createdAt: entry.createdAt!,
    updatedAt: entry.updatedAt!,
  });
  wsHub.emit("secrets:created", meta);
  return meta;
}

export function updateSecret(id: string, body: { key?: string; value?: string; description?: string | null }) {
  const current = getDb().select().from(secrets).where(eq(secrets.id, id)).get();
  if (!current) throw new BadRequestException("Secret not found");

  const nextKey = body.key !== undefined ? body.key.trim() : current.key;
  assertKey(nextKey);

  if (nextKey !== current.key) {
    const clash = getDb().select().from(secrets).where(eq(secrets.key, nextKey)).get();
    if (clash) throw new BadRequestException(`Key "${nextKey}" already exists`);
  }

  if (body.value !== undefined && body.value.length === 0) {
    throw new BadRequestException("value cannot be empty");
  }

  const updatedAt = new Date();
  getDb()
    .update(secrets)
    .set({
      key: nextKey,
      value: body.value !== undefined ? encryptSecret(body.value) : current.value,
      description: body.description !== undefined ? body.description?.trim() || null : current.description,
      updatedAt,
    })
    .where(eq(secrets.id, id))
    .run();

  const meta = getSecretMeta(id);
  wsHub.emit("secrets:updated", meta);
  return meta;
}

export function deleteSecret(id: string) {
  const current = getSecretMeta(id);
  if (!current) throw new BadRequestException("Secret not found");
  getDb().delete(secrets).where(eq(secrets.id, id)).run();
  wsHub.emit("secrets:deleted", { id });
}

/** Internal — decrypt map for tool runtime ctx.secrets */
export function loadSecretsMap(): Record<string, string> {
  const rows = getDb().select({ key: secrets.key, value: secrets.value }).from(secrets).all();
  const out: Record<string, string> = {};
  for (const row of rows) {
    try {
      out[row.key] = decryptSecret(row.value);
    } catch (err) {
      console.error(`[secrets] failed to decrypt key=${row.key}`, err);
    }
  }
  return out;
}
