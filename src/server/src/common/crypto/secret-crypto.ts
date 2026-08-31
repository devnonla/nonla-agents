/**
 * AES-256-GCM helpers for secrets at-rest.
 * Master key: SECRET_ENCRYPTION_KEY env, else auto-gen in configurations.secret_encryption_key
 * (independent from JWT — rotating JWT does not break encrypted secrets).
 */

import { createCipheriv, createDecipheriv } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export const SECRET_ENCRYPTION_SETTINGS_KEY = "secret_encryption_key";

let _key: Buffer | null = null;

function sha256(data: string): Buffer {
  return Buffer.from(new Bun.CryptoHasher("sha256").update(data).digest());
}

function randomBytes(n: number): Buffer {
  const buf = Buffer.alloc(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function getSecretEncryptionKey(): Buffer {
  if (_key) return _key;

  if (process.env.SECRET_ENCRYPTION_KEY) {
    _key = sha256(process.env.SECRET_ENCRYPTION_KEY);
    return _key;
  }

  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.key, SECRET_ENCRYPTION_SETTINGS_KEY)).get();

  if (row) {
    _key = sha256(row.value);
    return _key;
  }

  const generated = randomBytes(32).toString("hex");
  db.insert(appSettings).values({ key: SECRET_ENCRYPTION_SETTINGS_KEY, value: generated, updatedAt: new Date() }).run();
  _key = sha256(generated);
  return _key;
}

export function encryptSecret(plain: string): string {
  const key = getSecretEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid secret ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getSecretEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Test helper — clear in-memory key cache. */
export function _resetSecretEncryptionKeyCache() {
  _key = null;
}
