import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("MCP Servers API", () => {
  let app: Hono;
  let raw: Database;
  let cleanup: () => void;
  let token: string;
  let serverId: string;
  let agentId: string;

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    raw = t.raw;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  // ─── Happy path ────────────────────────────────────────────────────────────

  test("POST /api/mcp-servers — create server (sync may fail)", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "demo-mcp",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("demo-mcp");
    expect(data.url).toBe("https://example.com/mcp");
    expect(data).toHaveProperty("id");
    expect(data.tools).toEqual([]);
    expect(data.isActive).toBe(false);
    expect(typeof data.lastSyncError).toBe("string");
    expect((data.lastSyncError as string).length).toBeGreaterThan(0);
    const headers = data.headers as Record<string, string>;
    expect(headers.Authorization).not.toContain("secret-token");
    serverId = data.id as string;
  });

  test("PUT /api/mcp-servers/:id — toggle isActive", async () => {
    const offRes = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, { isActive: false });
    expect(offRes.status).toBe(200);
    const off = (await offRes.json()) as Record<string, unknown>;
    expect(off.isActive).toBe(false);

    const onRes = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, { isActive: true });
    expect(onRes.status).toBe(200);
    const on = (await onRes.json()) as Record<string, unknown>;
    expect(on.isActive).toBe(true);
  });

  test("POST /api/mcp-servers/:id/sync — deactivates and persists lastSyncError on failure", async () => {
    const res = await authRequest(app, token, "POST", `/api/mcp-servers/${serverId}/sync`);
    expect(res.status).toBe(400);

    const getRes = await authRequest(app, token, "GET", `/api/mcp-servers/${serverId}`);
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as Record<string, unknown>;
    expect(data.isActive).toBe(false);
    expect(typeof data.lastSyncError).toBe("string");
    expect((data.lastSyncError as string).length).toBeGreaterThan(0);
    expect(data.lastSyncedAt).toBeTruthy();
  });

  test("GET /api/mcp-servers — list includes catalog", async () => {
    raw.query("UPDATE mcp_servers SET tools = ? WHERE id = ?").run(
      JSON.stringify([
        { name: "search", description: "Search docs", inputSchema: { type: "object", properties: {} } },
        { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
      ]),
      serverId,
    );

    const res = await authRequest(app, token, "GET", "/api/mcp-servers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(1);
    expect(data.items[0].toolCount).toBe(2);
    const tools = data.items[0].tools as { name: string }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["read_file", "search"]);
  });

  test("GET /api/mcp-servers/:id — get one", async () => {
    const res = await authRequest(app, token, "GET", `/api/mcp-servers/${serverId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(serverId);
    expect((data.tools as unknown[]).length).toBe(2);
  });

  test("PUT /api/mcp-servers/:id — update name and merge masked headers", async () => {
    const getRes = await authRequest(app, token, "GET", `/api/mcp-servers/${serverId}`);
    const current = (await getRes.json()) as { headers: Record<string, string> };

    const res = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, {
      name: "demo-mcp-renamed",
      headers: current.headers,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("demo-mcp-renamed");
    expect((data.tools as unknown[]).length).toBe(2);

    const row = raw.query("SELECT headers FROM mcp_servers WHERE id = ?").get(serverId) as { headers: string };
    const stored = JSON.parse(row.headers) as { Authorization?: string };
    expect(stored.Authorization).toBe("Bearer secret-token");
  });

  test("POST /api/agents — create agent for MCP assignment", async () => {
    const res = await authRequest(app, token, "POST", "/api/agents", {
      name: "MCP Agent",
      description: "Uses MCP tools",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string };
    agentId = data.id;
  });

  test("POST /api/agents/:id/tool-assignments — assign mcp virtual tool id", async () => {
    const toolId = `mcp:${serverId}:search`;
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/tool-assignments`, { toolId });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.toolId).toBe(toolId);
    const tool = data.tool as { name: string; label: string; description: string };
    expect(tool.label).toBe("demo-mcp-renamed → search");
    expect(tool.description).toBe("Search docs");
    expect(tool.name).toBe("demo_mcp_renamed_search");
  });

  test("GET /api/agents/:id/tool-assignments — resolves MCP tool metadata", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(1);
    expect(data[0].toolId).toBe(`mcp:${serverId}:search`);
  });

  // ─── Validation / errors ───────────────────────────────────────────────────

  test("GET /api/mcp-servers/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/mcp-servers/missing-id");
    expect(res.status).toBe(400);
  });

  test("PUT /api/mcp-servers/:id — not found", async () => {
    const res = await authRequest(app, token, "PUT", "/api/mcp-servers/missing-id", {
      name: "x",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers — reject private URL", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "local",
      url: "http://localhost:3000/mcp",
    });
    expect(res.status).toBe(400);
  });

  test("PUT /api/mcp-servers/:id — reject private URL", async () => {
    const res = await authRequest(app, token, "PUT", `/api/mcp-servers/${serverId}`, {
      url: "http://127.0.0.1:8080/mcp",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers/:id/sync — not found", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers/missing-id/sync");
    expect(res.status).toBe(400);
  });

  test("POST /api/mcp-servers/:id/sync — inactive server", async () => {
    raw.query("UPDATE mcp_servers SET is_active = 0 WHERE id = ?").run(serverId);
    const res = await authRequest(app, token, "POST", `/api/mcp-servers/${serverId}/sync`);
    expect(res.status).toBe(400);
    raw.query("UPDATE mcp_servers SET is_active = 1 WHERE id = ?").run(serverId);
  });

  // ─── Business logic ────────────────────────────────────────────────────────

  test("POST /api/mcp-servers — create second server", async () => {
    const res = await authRequest(app, token, "POST", "/api/mcp-servers", {
      name: "alpha",
      url: "https://example.com/mcp-alpha",
      headers: { "X-Key": "alpha-secret" },
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.name).toBe("alpha");

    const putRes = await authRequest(app, token, "PUT", `/api/mcp-servers/${data.id}`, {
      url: "https://example.com/mcp-alpha-v2",
      headers: { "X-Key": "alpha-secret-2" },
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as { url: string };
    expect(updated.url).toBe("https://example.com/mcp-alpha-v2");

    const row = raw.query("SELECT headers FROM mcp_servers WHERE id = ?").get(data.id) as { headers: string };
    const stored = JSON.parse(row.headers) as { "X-Key"?: string };
    expect(stored["X-Key"]).toBe("alpha-secret-2");

    const delRes = await authRequest(app, token, "DELETE", `/api/mcp-servers/${data.id}`);
    expect(delRes.status).toBe(200);
  });

  test("DELETE /api/mcp-servers/:id — removes server and MCP assignments", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/mcp-servers/${serverId}`);
    expect(res.status).toBe(200);

    const listRes = await authRequest(app, token, "GET", "/api/mcp-servers");
    const list = (await listRes.json()) as { items: unknown[] };
    expect(list.items.length).toBe(0);

    const assignmentsRes = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    const assignments = (await assignmentsRes.json()) as unknown[];
    expect(assignments.length).toBe(0);
  });
});
