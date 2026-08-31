import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { secrets } from "../common/db/schema.js";
import { loadSecretsMap } from "../modules/secrets/secrets.service.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Secrets API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let db: ReturnType<typeof createTestApp>["db"];
  let secretId = "";

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    db = t.db;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  test("POST /api/secrets — create returns metadata only", async () => {
    const res = await authRequest(app, token, "POST", "/api/secrets", {
      key: "API_TOKEN",
      value: "super-secret-value",
      description: "Token",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.key).toBe("API_TOKEN");
    expect(data).not.toHaveProperty("value");
    secretId = data.id as string;
  });

  test("GET /api/secrets — list never returns value", async () => {
    const res = await authRequest(app, token, "GET", "/api/secrets");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Record<string, unknown>[] };
    const item = data.items.find((i) => i.key === "API_TOKEN");
    expect(item).toBeTruthy();
    expect(item).not.toHaveProperty("value");
  });

  test("GET /api/secrets/:id — metadata only", async () => {
    const res = await authRequest(app, token, "GET", `/api/secrets/${secretId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).not.toHaveProperty("value");
  });

  test("DB stores ciphertext not plaintext", () => {
    const row = db.select().from(secrets).where(eq(secrets.id, secretId)).get();
    expect(row).toBeTruthy();
    expect(row!.value.startsWith("v1:")).toBe(true);
    expect(row!.value).not.toContain("super-secret-value");
  });

  test("loadSecretsMap decrypts for tool runtime", () => {
    const map = loadSecretsMap();
    expect(map.API_TOKEN).toBe("super-secret-value");
  });

  test("POST /api/secrets — encrypt decrypt preserves Vietnamese", async () => {
    const original = "khoảng 211 nghìn các kênh ấy";
    const res = await authRequest(app, token, "POST", "/api/secrets", {
      key: "VI_SECRET",
      value: original,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    expect(loadSecretsMap().VI_SECRET).toBe(original);

    const updated = `${original} — ${"ảầẫấậ ".repeat(80)}`;
    const put = await authRequest(app, token, "PUT", `/api/secrets/${created.id}`, { value: updated });
    expect(put.status).toBe(200);
    expect(loadSecretsMap().VI_SECRET).toBe(updated);

    await authRequest(app, token, "DELETE", `/api/secrets/${created.id}`);
  });

  test("PUT /api/secrets/:id — rotate value", async () => {
    const res = await authRequest(app, token, "PUT", `/api/secrets/${secretId}`, {
      value: "rotated-secret",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).not.toHaveProperty("value");
    expect(loadSecretsMap().API_TOKEN).toBe("rotated-secret");
  });

  test("GET /api/settings/values — secret_encryption_key never returned", async () => {
    const res = await authRequest(app, token, "GET", "/api/settings/values?keys=secret_encryption_key");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, string>;
    expect(data).not.toHaveProperty("secret_encryption_key");
  });

  test("DELETE /api/secrets/:id", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/secrets/${secretId}`);
    expect(res.status).toBe(200);
    expect(loadSecretsMap().API_TOKEN).toBeUndefined();
  });

  test("GET /api/secrets — member → 403", async () => {
    await authRequest(app, token, "POST", "/api/users", {
      username: "sec_member",
      name: "Sec Member",
      password: "password123",
      role: "member",
    });
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "sec_member", password: "password123" }),
    });
    const { token: memberToken } = (await loginRes.json()) as { token: string };
    const res = await authRequest(app, memberToken, "GET", "/api/secrets");
    expect(res.status).toBe(403);
  });
});
