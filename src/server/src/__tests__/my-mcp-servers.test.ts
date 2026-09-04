import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("My MCP servers API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let toolId: string;
  let extraToolId: string;
  let serverId: string;
  let rawKey: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;

    const t1 = await authRequest(app, token, "POST", "/api/tools", {
      name: "echo_tool",
      label: "Echo",
      description: "Echo input",
      parameters: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
      codeContent: "export default async function main(input: Record<string, unknown>) {\n  return { echo: input.x };\n}\n",
    });
    expect(t1.status).toBe(201);
    toolId = ((await t1.json()) as { id: string }).id;

    const t2 = await authRequest(app, token, "POST", "/api/tools", {
      name: "other_tool",
      label: "Other",
      description: "Unused",
      parameters: { type: "object", properties: {} },
      codeContent: "export default async function main() {\n  return { ok: true };\n}\n",
    });
    expect(t2.status).toBe(201);
    extraToolId = ((await t2.json()) as { id: string }).id;
  });

  afterAll(() => cleanup());

  async function mcpRpc(id: string, key: string | null, method: string, params?: Record<string, unknown>, rpcId: string | number | null = 1) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    return app.request(`/mcp/${id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    });
  }

  test("POST /api/my-mcp-servers — create returns key once", async () => {
    const res = await authRequest(app, token, "POST", "/api/my-mcp-servers", {
      name: "Cursor tools",
      description: "For Cursor",
      toolIds: [toolId],
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Cursor tools");
    expect(data.toolCount).toBe(1);
    expect(typeof data.key).toBe("string");
    expect(String(data.key).startsWith("ra_mcp_")).toBe(true);
    expect(data).not.toHaveProperty("keyHash");
    serverId = data.id as string;
    rawKey = data.key as string;
  });

  test("GET /api/my-mcp-servers — list is lean", async () => {
    const res = await authRequest(app, token, "GET", "/api/my-mcp-servers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Record<string, unknown>[] };
    const row = data.items.find((s) => s.id === serverId);
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("key");
    expect(row).not.toHaveProperty("keyHash");
    expect(row).not.toHaveProperty("tools");
    expect(row?.toolCount).toBe(1);
    expect(row?.keyPrefix).toBe(rawKey.slice(0, 12));
  });

  test("GET /api/my-mcp-servers/:id — detail lists tools", async () => {
    const res = await authRequest(app, token, "GET", `/api/my-mcp-servers/${serverId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tools: { id: string; name: string }[] };
    expect(data.tools.map((t) => t.id)).toEqual([toolId]);
    expect(data.tools[0]?.name).toBe("echo_tool");
  });

  test("PUT /api/my-mcp-servers/:id — assign and remove tools", async () => {
    const add = await authRequest(app, token, "PUT", `/api/my-mcp-servers/${serverId}`, { toolIds: [toolId, extraToolId] });
    expect(add.status).toBe(200);
    expect(((await add.json()) as { toolCount: number }).toolCount).toBe(2);

    const drop = await authRequest(app, token, "PUT", `/api/my-mcp-servers/${serverId}`, { toolIds: [toolId] });
    expect(drop.status).toBe(200);
    expect(((await drop.json()) as { toolCount: number }).toolCount).toBe(1);
  });

  test("POST /api/my-mcp-servers — rejects builtin tools", async () => {
    const res = await authRequest(app, token, "POST", "/api/my-mcp-servers", {
      name: "bad",
      toolIds: ["builtin:browser"],
    });
    expect(res.status).toBe(400);
  });

  test("GET /mcp/:id — 405 not HTML", async () => {
    const res = await app.request(`/mcp/${serverId}`, { method: "GET" });
    expect(res.status).toBe(405);
    const text = await res.text();
    expect(text.toLowerCase().includes("<html")).toBe(false);
  });

  test("POST /mcp/:id — 401 missing or wrong key", async () => {
    const missing = await mcpRpc(serverId, null, "initialize");
    expect(missing.status).toBe(401);
    const wrong = await mcpRpc(serverId, "ra_mcp_deadbeef", "initialize");
    expect(wrong.status).toBe(401);
  });

  test("POST /mcp/:id initialize + tools/list", async () => {
    const init = await mcpRpc(serverId, rawKey, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    const initBody = (await init.json()) as { result: { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string } } };
    expect(initBody.result.protocolVersion).toBe("2025-03-26");
    expect(initBody.result.serverInfo.name).toBe("Cursor tools");
    expect(initBody.result.capabilities.tools).toEqual({});

    const notified = await app.request(`/mcp/${serverId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notified.status).toBe(202);

    const list = await mcpRpc(serverId, rawKey, "tools/list");
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { result: { tools: { name: string; inputSchema: object }[] } };
    expect(listBody.result.tools).toHaveLength(1);
    expect(listBody.result.tools[0]?.name).toBe("echo_tool");
    expect(listBody.result.tools[0]?.inputSchema).toEqual({ type: "object", properties: { x: { type: "number" } }, required: ["x"] });
  });

  test("POST /mcp/:id tools/call — unassigned isError", async () => {
    const res = await mcpRpc(serverId, rawKey, "tools/call", { name: "other_tool", arguments: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain("not found");
  });

  test("POST /mcp/:id tools/call — assigned tool runs", async () => {
    const res = await mcpRpc(serverId, rawKey, "tools/call", { name: "echo_tool", arguments: { x: 7 } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(false);
    const payload = JSON.parse(body.result.content[0]?.text ?? "{}") as { ok: boolean; result: { echo: number } };
    expect(payload.ok).toBe(true);
    expect(payload.result.echo).toBe(7);
  }, 60_000);

  test("POST /mcp/:id — 403 when inactive", async () => {
    const off = await authRequest(app, token, "PUT", `/api/my-mcp-servers/${serverId}`, { isActive: false });
    expect(off.status).toBe(200);
    const res = await mcpRpc(serverId, rawKey, "initialize");
    expect(res.status).toBe(403);
    await authRequest(app, token, "PUT", `/api/my-mcp-servers/${serverId}`, { isActive: true });
  });

  test("DELETE /api/tools/:id — cascade off the server", async () => {
    const del = await authRequest(app, token, "DELETE", `/api/tools/${toolId}`);
    expect(del.status).toBe(200);
    const detail = await authRequest(app, token, "GET", `/api/my-mcp-servers/${serverId}`);
    const data = (await detail.json()) as { tools: unknown[]; toolCount: number };
    expect(data.tools).toEqual([]);
    expect(data.toolCount).toBe(0);
  });

  test("POST /api/my-mcp-servers/:id/rotate-key — new key, old rejected", async () => {
    const res = await authRequest(app, token, "POST", `/api/my-mcp-servers/${serverId}/rotate-key`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { key: string; keyPrefix: string };
    expect(data.key.startsWith("ra_mcp_")).toBe(true);
    expect(data.key).not.toBe(rawKey);

    const old = await mcpRpc(serverId, rawKey, "ping");
    expect(old.status).toBe(401);
    const fresh = await mcpRpc(serverId, data.key, "ping");
    expect(fresh.status).toBe(200);
    rawKey = data.key;
  });

  test("DELETE /api/my-mcp-servers/:id", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/my-mcp-servers/${serverId}`);
    expect(res.status).toBe(200);
    const gone = await authRequest(app, token, "GET", `/api/my-mcp-servers/${serverId}`);
    expect(gone.status).toBe(404);
    const mcp = await mcpRpc(serverId, rawKey, "initialize");
    expect(mcp.status).toBe(404);
  });
});
