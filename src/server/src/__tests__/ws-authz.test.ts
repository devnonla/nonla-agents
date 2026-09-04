import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getDb } from "../common/db/client.js";
import { users } from "../common/db/schema.js";
import { createAppServer } from "../common/ws/create-app-server.js";
import { WS_APP_PROTOCOL, WS_JWT_PROTOCOL_PREFIX, extractWsToken } from "../common/ws/ws-auth.js";
import { clientMayReceive, wsHub } from "../common/ws/wsHub.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

/** Bun WebSocket accepts headers; DOM typings only allow protocol list. */
type BunWsOptions = {
  protocols?: string | string[];
  headers?: Record<string, string>;
};

function openWs(url: string, options?: BunWsOptions): WebSocket {
  return new WebSocket(url, options as never);
}

describe("wsHub role filter", () => {
  test("secrets:* — admin only", () => {
    expect(clientMayReceive("admin", "secrets:created")).toBe(true);
    expect(clientMayReceive("admin", "secrets:updated")).toBe(true);
    expect(clientMayReceive("admin", "secrets:deleted")).toBe(true);
    expect(clientMayReceive("member", "secrets:created")).toBe(false);
    expect(clientMayReceive("member", "secrets:updated")).toBe(false);
    expect(clientMayReceive("member", "secrets:deleted")).toBe(false);
  });

  test("kvstore:* — any authenticated role", () => {
    expect(clientMayReceive("admin", "kvstore:created")).toBe(true);
    expect(clientMayReceive("member", "kvstore:updated")).toBe(true);
    expect(clientMayReceive("member", "kvstore:deleted")).toBe(true);
  });
});

describe("extractWsToken", () => {
  test("reads Authorization Bearer", () => {
    const req = new Request("http://localhost/ws", {
      headers: { Authorization: "Bearer abc.def.ghi" },
    });
    expect(extractWsToken(req)).toBe("abc.def.ghi");
  });

  test("reads jwt.* Sec-WebSocket-Protocol", () => {
    const req = new Request("http://localhost/ws", {
      headers: {
        "Sec-WebSocket-Protocol": `${WS_APP_PROTOCOL}, ${WS_JWT_PROTOCOL_PREFIX}abc.def.ghi`,
      },
    });
    expect(extractWsToken(req)).toBe("abc.def.ghi");
  });

  test("Authorization takes precedence over protocol", () => {
    const req = new Request("http://localhost/ws", {
      headers: {
        Authorization: "Bearer from-header",
        "Sec-WebSocket-Protocol": `${WS_JWT_PROTOCOL_PREFIX}from-proto`,
      },
    });
    expect(extractWsToken(req)).toBe("from-header");
  });

  test("ignores query ?token=", () => {
    const req = new Request("http://localhost/ws?token=query-token");
    expect(extractWsToken(req)).toBeNull();
  });
});

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.onclose = () => resolve();
  });
}

/** Open socket and wait for server `client:id` (attach handlers before race). */
function connectUntilClientId(ws: WebSocket, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS client:id timeout")), timeoutMs);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as { type: string; payload: { clientId: string } };
        if (msg.type === "client:id") {
          clearTimeout(timer);
          resolve(msg.payload.clientId);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WS connection error"));
    };
  });
}

function collectMessages(ws: WebSocket, durationMs: number): Promise<unknown[]> {
  const messages: unknown[] = [];
  ws.onmessage = (e) => {
    try {
      messages.push(JSON.parse(String(e.data)));
    } catch {
      messages.push(e.data);
    }
  };
  return new Promise((resolve) => setTimeout(() => resolve(messages), durationMs));
}

describe("WS upgrade integration", () => {
  let app: Hono;
  let cleanup: () => void;
  let server: ReturnType<typeof createAppServer>;
  let adminToken: string;
  let memberToken: string;
  let adminUserId: string;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    cleanup = t.cleanup;

    const admin = await setupAdmin(app);
    adminToken = admin.token;
    adminUserId = admin.user.id as string;

    await authRequest(app, adminToken, "POST", "/api/users", {
      username: "ws_member",
      name: "WS Member",
      password: "password123",
      role: "member",
    });
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ws_member", password: "password123" }),
    });
    memberToken = ((await loginRes.json()) as { token: string }).token;

    server = createAppServer({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${server.port}`;
    wsUrl = `ws://127.0.0.1:${server.port}/ws`;
  });

  afterAll(() => {
    wsHub._resetForTests();
    server.stop(true);
    cleanup();
  });

  test("upgrade without token → 401", async () => {
    const res = await fetch(`${baseUrl}/ws`);
    expect(res.status).toBe(401);
  });

  test("upgrade with query ?token= → 401 (rejected)", async () => {
    const res = await fetch(`${baseUrl}/ws?token=${encodeURIComponent(adminToken)}`);
    expect(res.status).toBe(401);
  });

  test("upgrade with invalid Bearer → 401", async () => {
    const res = await fetch(`${baseUrl}/ws`, {
      headers: { Authorization: "Bearer not-a-valid-jwt" },
    });
    expect(res.status).toBe(401);
  });

  test("upgrade with Authorization Bearer → opens and sends client:id", async () => {
    const ws = openWs(wsUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    try {
      const clientId = await connectUntilClientId(ws);
      expect(clientId.length).toBeGreaterThan(0);
    } finally {
      ws.close();
      await waitForClose(ws);
    }
  });

  test("upgrade with Sec-WebSocket-Protocol jwt.* → opens, echoes nonla-agents only", async () => {
    const ws = openWs(wsUrl, {
      protocols: [WS_APP_PROTOCOL, `${WS_JWT_PROTOCOL_PREFIX}${adminToken}`],
    });
    try {
      const clientId = await connectUntilClientId(ws);
      expect(ws.protocol).toBe(WS_APP_PROTOCOL);
      expect(clientId).toBeTruthy();
    } finally {
      ws.close();
      await waitForClose(ws);
    }
  });

  test("inactive user token → 401", async () => {
    getDb().update(users).set({ isActive: false }).where(eq(users.id, adminUserId)).run();

    try {
      const res = await fetch(`${baseUrl}/ws`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(401);
    } finally {
      getDb().update(users).set({ isActive: true }).where(eq(users.id, adminUserId)).run();
    }
  });

  test("member does not receive secrets:* broadcast; admin does", async () => {
    const adminWs = openWs(wsUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const memberWs = openWs(wsUrl, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    try {
      await Promise.all([connectUntilClientId(adminWs), connectUntilClientId(memberWs)]);

      const adminMsgsP = collectMessages(adminWs, 200);
      const memberMsgsP = collectMessages(memberWs, 200);

      wsHub.broadcast("secrets:created", { id: "sec-1", key: "API_TOKEN" });
      wsHub.broadcast("kvstore:created", { id: "kv-1", key: "BASE_URL" });

      const [adminMsgs, memberMsgs] = await Promise.all([adminMsgsP, memberMsgsP]);

      const adminTypes = adminMsgs.map((m) => (m as { type: string }).type);
      const memberTypes = memberMsgs.map((m) => (m as { type: string }).type);

      expect(adminTypes).toContain("secrets:created");
      expect(adminTypes).toContain("kvstore:created");
      expect(memberTypes).not.toContain("secrets:created");
      expect(memberTypes).toContain("kvstore:created");
    } finally {
      adminWs.close();
      memberWs.close();
      await Promise.all([waitForClose(adminWs), waitForClose(memberWs)]);
    }
  });
});
