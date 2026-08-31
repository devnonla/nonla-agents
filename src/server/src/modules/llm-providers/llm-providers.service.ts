import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../common/crypto/secret-crypto.js";
import { type LlmProvider, type NewLlmProvider, getDb, llmProviders } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";

export type ProviderPublic = {
  id: string;
  provider: string;
  label: string;
  customBaseUrl: string;
  models: string[];
  createdAt: Date;
  updatedAt: Date;
  hasApiKey: boolean;
  maskedApiKey: string;
};

function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === "v1";
}

/** Decrypt stored apiKey for backend use only. Supports legacy plaintext. */
export function decryptProviderApiKey(stored: string | null | undefined): string {
  if (!stored) return "";
  if (isEncrypted(stored)) return decryptSecret(stored);
  return stored;
}

export function toProviderPublic(row: LlmProvider): ProviderPublic {
  const hasApiKey = !!row.apiKey;
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    customBaseUrl: row.customBaseUrl,
    models: row.models ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasApiKey,
    maskedApiKey: hasApiKey ? "••••••••" : "",
  };
}

export function getProvider(id: string) {
  return getDb().select().from(llmProviders).where(eq(llmProviders.id, id)).get();
}

/** Internal — provider row with decrypted apiKey for LLM / fetchModels. */
export function getProviderForUse(id: string): (Omit<LlmProvider, "apiKey"> & { apiKey: string }) | null {
  const row = getProvider(id);
  if (!row) return null;
  return { ...row, apiKey: decryptProviderApiKey(row.apiKey) };
}

export function createProvider(body: Pick<NewLlmProvider, "provider" | "label" | "apiKey" | "customBaseUrl" | "models">) {
  const now = new Date();
  const row: NewLlmProvider = {
    ...body,
    apiKey: body.apiKey ? encryptSecret(body.apiKey) : "",
    createdAt: now,
    updatedAt: now,
  };
  const [created] = getDb().insert(llmProviders).values(row).returning().all();
  return created;
}

export function updateProvider(id: string, body: Partial<Pick<NewLlmProvider, "provider" | "label" | "apiKey" | "customBaseUrl" | "models">>) {
  const db = getDb();
  const current = db.select().from(llmProviders).where(eq(llmProviders.id, id)).get();
  if (!current) throw new BadRequestException("Provider not found");

  const patch: Partial<NewLlmProvider> & { updatedAt: Date } = { updatedAt: new Date() };
  if (body.provider !== undefined) patch.provider = body.provider;
  if (body.label !== undefined) patch.label = body.label;
  if (body.customBaseUrl !== undefined) patch.customBaseUrl = body.customBaseUrl;
  if (body.models !== undefined) patch.models = body.models;
  // Empty / omitted apiKey keeps the existing ciphertext (write-only rotate).
  if (typeof body.apiKey === "string" && body.apiKey.length > 0) {
    patch.apiKey = encryptSecret(body.apiKey);
  }

  db.update(llmProviders).set(patch).where(eq(llmProviders.id, id)).run();
  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()!;
}

export function deleteProvider(id: string) {
  getDb().delete(llmProviders).where(eq(llmProviders.id, id)).run();
}
