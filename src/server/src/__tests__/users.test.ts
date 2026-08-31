import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Users API", () => {
  let app: Hono;
  let cleanup: () => void;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    adminToken = admin.token;
    adminUserId = admin.user.id as string;
  });

  afterAll(() => cleanup());

  // ── Create User ───────────────────────────────────────────────────────

  let newUserId = "";

  test("POST /api/users — create member user", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/users", {
      username: "member1",
      name: "Member One",
      password: "member1pass",
      role: "member",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.username).toBe("member1");
    expect(data.name).toBe("Member One");
    expect(data.role).toBe("member");
    expect(data).not.toHaveProperty("passwordHash");
    newUserId = data.id as string;
  });

  test("POST /api/users — duplicate username rejected", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/users", {
      username: "member1",
      name: "Duplicate",
      password: "password123",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/users — password too short", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/users", {
      username: "short",
      name: "Short",
      password: "abc",
    });

    expect(res.status).toBe(400);
  });

  // ── List Users ────────────────────────────────────────────────────────

  test("GET /api/users — list users", async () => {
    const res = await authRequest(app, adminToken, "GET", "/api/users");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(2); // admin + member1
    // No password hashes exposed
    for (const user of data.items) {
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  // ── Get User ──────────────────────────────────────────────────────────

  test("GET /api/users/:id — get user", async () => {
    const res = await authRequest(app, adminToken, "GET", `/api/users/${newUserId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.username).toBe("member1");
  });

  test("GET /api/users/:id — not found", async () => {
    const res = await authRequest(app, adminToken, "GET", "/api/users/nonexistent-id");
    expect(res.status).toBe(400);
  });

  // ── Update User ───────────────────────────────────────────────────────

  test("PUT /api/users/:id — update user", async () => {
    const res = await authRequest(app, adminToken, "PUT", `/api/users/${newUserId}`, {
      name: "Updated Member",
      role: "admin",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Member");
    expect(data.role).toBe("admin");
  });

  // ── Reset Password ────────────────────────────────────────────────────

  test("POST /api/users/:id/reset-password — reset with provided password", async () => {
    const loginBefore = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "member1", password: "member1pass" }),
    });
    expect(loginBefore.status).toBe(200);
    const beforeSession = (await loginBefore.json()) as { refreshToken: string };

    const res = await authRequest(app, adminToken, "POST", `/api/users/${newUserId}/reset-password`, {
      password: "newpassword123",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { password: string };
    expect(data.password).toBe("newpassword123");

    const revokedRefresh = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: beforeSession.refreshToken }),
    });
    expect(revokedRefresh.status).toBe(401);

    // Verify the new password works by logging in
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "member1", password: "newpassword123" }),
    });
    expect(loginRes.status).toBe(200);
  });

  test("POST /api/users/:id/reset-password — auto-generate password", async () => {
    const res = await authRequest(app, adminToken, "POST", `/api/users/${newUserId}/reset-password`, {});

    expect(res.status).toBe(200);
    const data = (await res.json()) as { password: string };
    expect(data.password).toBeTruthy();
    expect(data.password.length).toBeGreaterThanOrEqual(8);
  });

  // ── Delete User ───────────────────────────────────────────────────────

  test("DELETE /api/users/:id — cannot delete self", async () => {
    const res = await authRequest(app, adminToken, "DELETE", `/api/users/${adminUserId}`);
    expect(res.status).toBe(400);
  });

  test("DELETE /api/users/:id — delete other user", async () => {
    const res = await authRequest(app, adminToken, "DELETE", `/api/users/${newUserId}`);
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await authRequest(app, adminToken, "GET", `/api/users/${newUserId}`);
    expect(getRes.status).toBe(400);
  });

  // ── Role-based Access ─────────────────────────────────────────────────

  test("GET /api/users — member cannot access (403)", async () => {
    // Create a member user
    const createRes = await authRequest(app, adminToken, "POST", "/api/users", {
      username: "restricted_member",
      name: "Restricted",
      password: "password123",
    });
    expect(createRes.status).toBe(201);

    // Login as member
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "restricted_member", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as { token: string };

    // Try to access users endpoint as member
    const res = await authRequest(app, loginData.token, "GET", "/api/users");
    expect(res.status).toBe(403);
  });
});
