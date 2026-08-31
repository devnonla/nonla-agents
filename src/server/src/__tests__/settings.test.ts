import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Settings API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  // ── Load Settings ─────────────────────────────────────────────────────

  test("GET /api/settings/values — load timezone (set during setup)", async () => {
    const res = await authRequest(app, token, "GET", "/api/settings/values?keys=timezone");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, string>;
    expect(data.timezone).toBe("Asia/Ho_Chi_Minh");
  });

  test("GET /api/settings/values — empty keys returns empty", async () => {
    const res = await authRequest(app, token, "GET", "/api/settings/values?keys=");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, string>;
    expect(Object.keys(data).length).toBe(0);
  });

  test("GET /api/settings/values — jwt_secret is never returned", async () => {
    const res = await authRequest(app, token, "GET", "/api/settings/values?keys=jwt_secret");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, string>;
    expect(data).not.toHaveProperty("jwt_secret");
  });

  // ── Save Settings ─────────────────────────────────────────────────────

  test("PATCH /api/settings — save custom setting", async () => {
    const res = await authRequest(app, token, "PATCH", "/api/settings", {
      custom_key: "custom_value",
      another_key: "another_value",
    });

    expect(res.status).toBe(200);

    // Verify saved
    const loadRes = await authRequest(app, token, "GET", "/api/settings/values?keys=custom_key,another_key");
    const data = (await loadRes.json()) as Record<string, string>;
    expect(data.custom_key).toBe("custom_value");
    expect(data.another_key).toBe("another_value");
  });

  test("PATCH /api/settings — upsert existing setting", async () => {
    const res = await authRequest(app, token, "PATCH", "/api/settings", {
      timezone: "UTC",
    });

    expect(res.status).toBe(200);

    // Verify updated
    const loadRes = await authRequest(app, token, "GET", "/api/settings/values?keys=timezone");
    const data = (await loadRes.json()) as Record<string, string>;
    expect(data.timezone).toBe("UTC");
  });

  // ── Timezones ─────────────────────────────────────────────────────────

  test("GET /api/settings/timezones — returns timezone list", async () => {
    const res = await authRequest(app, token, "GET", "/api/settings/timezones");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { tz: string; offset: string }[];
    expect(data.length).toBeGreaterThan(0);

    // Each item should have tz and offset
    expect(data[0]).toHaveProperty("tz");
    expect(data[0]).toHaveProperty("offset");
  });
});
