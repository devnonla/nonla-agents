import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { _resetSecretEncryptionKeyCache, decryptSecret, encryptSecret, getSecretEncryptionKey } from "../common/crypto/secret-crypto.js";
import { createTestApp } from "./test-helpers.js";

describe("secret-crypto", () => {
  let cleanup: () => void;
  const prevEnv = process.env.SECRET_ENCRYPTION_KEY;

  beforeEach(() => {
    const t = createTestApp();
    cleanup = t.cleanup;
    delete process.env.SECRET_ENCRYPTION_KEY;
    _resetSecretEncryptionKeyCache();
  });

  afterEach(() => {
    cleanup();
    _resetSecretEncryptionKeyCache();
    if (prevEnv === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
    else process.env.SECRET_ENCRYPTION_KEY = prevEnv;
  });

  test("encrypt → decrypt roundtrip", () => {
    const plain = "sk-live-super-secret";
    const cipher = encryptSecret(plain);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher)).toBe(plain);
  });

  test("encrypt → decrypt preserves Vietnamese", () => {
    const plain = "khoảng 211 nghìn các kênh ấy ảầẫấậ";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  test("getSecretEncryptionKey is stable within process", () => {
    const a = getSecretEncryptionKey();
    const b = getSecretEncryptionKey();
    expect(Buffer.compare(a, b)).toBe(0);
    expect(a.length).toBe(32);
  });

  test("wrong key fails decrypt", () => {
    const cipher = encryptSecret("hello");
    _resetSecretEncryptionKeyCache();
    process.env.SECRET_ENCRYPTION_KEY = "totally-different-key";
    expect(() => decryptSecret(cipher)).toThrow();
  });
});
