import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import rootPkg from "../../../../package.json" with { type: "json" };
import { createTestApp } from "./test-helpers.js";

describe("Health Check", () => {
  let app: Hono;
  let cleanup: () => void;

  beforeAll(() => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
  });

  afterAll(() => cleanup());

  test("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.app).toBe("nonla-agents");
    expect(data.runtime).toBe("bun");
    expect(data.version).toBe(rootPkg.version);
    expect(typeof data.buildId).toBe("string");
    expect(String(data.buildId).length).toBeGreaterThan(0);
  });
});
