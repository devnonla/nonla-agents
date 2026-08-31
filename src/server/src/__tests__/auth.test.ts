import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authHeaders, authRequest, createTestApp } from "./test-helpers.js";

describe("Auth API", () => {
  let app: Hono;
  let cleanup: () => void;

  beforeAll(() => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
  });

  afterAll(() => cleanup());

  // ── Setup Status ──────────────────────────────────────────────────────

  test("GET /api/auth/setup-status — needsSetup=true when no users", async () => {
    const res = await app.request("/api/auth/setup-status");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { needsSetup: boolean };
    expect(data.needsSetup).toBe(true);
  });

  // ── Initial Setup ─────────────────────────────────────────────────────

  let adminToken = "";
  let adminRefreshToken = "";

  test("POST /api/auth/setup — create first admin", async () => {
    const res = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        name: "Admin User",
        password: "password123",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; refreshToken: string; user: Record<string, unknown> };
    expect(data.token).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.username).toBe("admin");
    expect(data.user.name).toBe("Admin User");
    expect(data.user.role).toBe("admin");
    // Password hash should NOT be in response
    expect(data.user).not.toHaveProperty("passwordHash");

    adminToken = data.token;
    adminRefreshToken = data.refreshToken;
  });

  test("GET /api/auth/setup-status — needsSetup=false after setup", async () => {
    const res = await app.request("/api/auth/setup-status");
    const data = (await res.json()) as { needsSetup: boolean };
    expect(data.needsSetup).toBe(false);
  });

  test("POST /api/auth/setup — reject when already setup", async () => {
    const res = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin2",
        name: "Admin 2",
        password: "password123",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(400);
  });

  // ── Login ─────────────────────────────────────────────────────────────

  test("POST /api/auth/login — successful login", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; refreshToken: string; user: Record<string, unknown> };
    expect(data.token).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.username).toBe("admin");
    adminToken = data.token;
    adminRefreshToken = data.refreshToken;
  });

  test("POST /api/auth/login — wrong password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/auth/login — non-existent user", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent", password: "password123" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Me ────────────────────────────────────────────────────────────────

  test("GET /api/auth/me — returns user with valid token", async () => {
    const res = await app.request("/api/auth/me", {
      headers: authHeaders(adminToken),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.username).toBe("admin");
    expect(data).not.toHaveProperty("passwordHash");
  });

  test("GET /api/auth/me — 401 without token", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  // ── Refresh ───────────────────────────────────────────────────────────

  test("POST /api/auth/refresh — issues new token pair and rotates", async () => {
    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; refreshToken: string };
    expect(data.token).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.refreshToken).not.toBe(adminRefreshToken);

    const meRes = await app.request("/api/auth/me", {
      headers: authHeaders(data.token),
    });
    expect(meRes.status).toBe(200);

    const reused = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });
    expect(reused.status).toBe(401);

    // Within the short race grace window, reuse must not wipe the rotated session
    const afterReuse = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    });
    expect(afterReuse.status).toBe(200);
    const rotatedAgain = (await afterReuse.json()) as { token: string; refreshToken: string };
    adminToken = rotatedAgain.token;
    adminRefreshToken = rotatedAgain.refreshToken;
  });

  test("POST /api/auth/refresh — invalid token → 401", async () => {
    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "not-a-valid-refresh-token" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/logout — revokes refresh token", async () => {
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const session = (await loginRes.json()) as { token: string; refreshToken: string };

    const logoutRes = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(refreshRes.status).toBe(401);
  });

  // ── Change Password ───────────────────────────────────────────────────

  test("POST /api/auth/change-password — success and revokes refresh", async () => {
    const beforeRefresh = adminRefreshToken;

    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "password123",
      newPassword: "newpassword456",
    });

    expect(res.status).toBe(200);

    const revokedRefresh = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: beforeRefresh }),
    });
    expect(revokedRefresh.status).toBe(401);

    // Verify new password works
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "newpassword456" }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as { token: string; refreshToken: string };
    adminToken = loginData.token;
    adminRefreshToken = loginData.refreshToken;

    // Change back for remaining tests
    await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "newpassword456",
      newPassword: "password123",
    });

    const restoreLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const restored = (await restoreLogin.json()) as { token: string; refreshToken: string };
    adminToken = restored.token;
    adminRefreshToken = restored.refreshToken;
  });

  test("POST /api/auth/change-password — wrong old password", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "totallyWrong",
      newPassword: "newpassword456",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/auth/change-password — new password too short", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "password123",
      newPassword: "short",
    });

    expect(res.status).toBe(400);
  });

  // ── Update Profile ────────────────────────────────────────────────────

  test("PATCH /api/auth/update-profile — update name", async () => {
    const res = await app.request("/api/auth/update-profile", {
      method: "PATCH",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ name: "Updated Admin" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Admin");
  });
});
