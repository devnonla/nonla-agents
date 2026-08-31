import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("KV Store API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let entryId = "";

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  test("POST /api/kvstore — create", async () => {
    const res = await authRequest(app, token, "POST", "/api/kvstore", {
      key: "BASE_URL",
      value: "https://api.example.com",
      description: "API base",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; key: string; value: string };
    expect(data.key).toBe("BASE_URL");
    expect(data.value).toBe("https://api.example.com");
    entryId = data.id;
  });

  test("GET /api/kvstore — list includes value", async () => {
    const res = await authRequest(app, token, "GET", "/api/kvstore");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { key: string; value: string }[] };
    expect(data.items.some((i) => i.key === "BASE_URL" && i.value === "https://api.example.com")).toBe(true);
  });

  test("GET /api/kvstore/:id — detail", async () => {
    const res = await authRequest(app, token, "GET", `/api/kvstore/${entryId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { value: string };
    expect(data.value).toBe("https://api.example.com");
  });

  test("PUT /api/kvstore/:id — update", async () => {
    const res = await authRequest(app, token, "PUT", `/api/kvstore/${entryId}`, {
      value: "https://api2.example.com",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { value: string };
    expect(data.value).toBe("https://api2.example.com");
  });

  test("PUT /api/kvstore/:id — preserves Vietnamese", async () => {
    const original = "khoảng 211 nghìn các kênh ấy";
    const createRes = await authRequest(app, token, "POST", "/api/kvstore", {
      key: "NOTE",
      value: original,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; value: string };
    expect(created.value).toBe(original);

    const updated = `${original} — ${"ảầẫấậ ".repeat(80)}`;
    const putRes = await authRequest(app, token, "PUT", `/api/kvstore/${created.id}`, { value: updated });
    expect(putRes.status).toBe(200);
    const put = (await putRes.json()) as { value: string };
    expect(put.value).toBe(updated);

    await authRequest(app, token, "DELETE", `/api/kvstore/${created.id}`);
  });

  test("POST /api/kvstore — invalid key", async () => {
    const res = await authRequest(app, token, "POST", "/api/kvstore", {
      key: "bad-key",
      value: "x",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/kvstore — duplicate key", async () => {
    const res = await authRequest(app, token, "POST", "/api/kvstore", {
      key: "BASE_URL",
      value: "x",
    });
    expect(res.status).toBe(400);
  });

  test("DELETE /api/kvstore/:id", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/kvstore/${entryId}`);
    expect(res.status).toBe(200);
  });

  test("GET /api/kvstore — unauthenticated → 401", async () => {
    const res = await app.request("/api/kvstore");
    expect(res.status).toBe(401);
  });

  test("GET /api/kvstore — member can access", async () => {
    await authRequest(app, token, "POST", "/api/users", {
      username: "kv_member",
      name: "KV Member",
      password: "password123",
      role: "member",
    });
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "kv_member", password: "password123" }),
    });
    const { token: memberToken } = (await loginRes.json()) as { token: string };

    const createRes = await authRequest(app, memberToken, "POST", "/api/kvstore", {
      key: "MEMBER_KEY",
      value: "from-member",
    });
    expect(createRes.status).toBe(201);

    const listRes = await authRequest(app, memberToken, "GET", "/api/kvstore");
    expect(listRes.status).toBe(200);
  });
});
