import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { normalizeRelation } from "../modules/agents/memory.service.js";
import type { MessageParam } from "../modules/agents/runtime/utils/agentRunner.js";
import { selectNodesForPrompt } from "../modules/agents/runtime/utils/factBudget.js";
import { buildExtractiveSummary, compactMessageParams } from "../modules/agents/runtime/utils/historyCompact.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Node budget", () => {
  test("prefers newest and respects char budget", () => {
    const nodes = [
      { id: "1", content: "a".repeat(100), updatedAt: new Date(1000) },
      { id: "2", content: "core-person", updatedAt: new Date(500) },
      { id: "3", content: "b".repeat(100), updatedAt: new Date(2000) },
      { id: "4", content: "c".repeat(100), updatedAt: new Date(3000) },
    ];
    const { injected, overflow } = selectNodesForPrompt(nodes, { maxChars: 250, maxItems: 10 });
    expect(injected[0]?.id).toBe("4");
    expect(injected.length + overflow.length).toBe(4);
    expect(overflow.length).toBeGreaterThan(0);
  });
});

describe("normalizeRelation", () => {
  test("snake_cases free-form labels", () => {
    expect(normalizeRelation("Competes With")).toBe("competes_with");
    expect(normalizeRelation("uses")).toBe("uses");
    expect(normalizeRelation("")).toBe("related_to");
  });
});

describe("History compact", () => {
  test("buildExtractiveSummary keeps user/assistant text", () => {
    const older: MessageParam[] = [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi there" },
      { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "x", args: {} }] },
      { role: "tool-result", toolCallId: "t1", toolName: "x", result: "{}" },
    ];
    const summary = buildExtractiveSummary(older);
    expect(summary).toContain("User: Hello world");
    expect(summary).toContain("Assistant: Hi there");
    expect(summary).not.toContain("tool");
  });

  test("compactMessageParams leaves short histories alone", () => {
    const messages: MessageParam[] = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? { role: "user" as const, content: `msg ${i}` } : { role: "assistant" as const, content: `msg ${i}` }));
    const result = compactMessageParams(messages);
    expect(result.compacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  test("compactMessageParams summarizes long histories", () => {
    const messages: MessageParam[] = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? { role: "user" as const, content: `msg ${i}` } : { role: "assistant" as const, content: `msg ${i}` }));
    const result = compactMessageParams(messages);
    expect(result.compacted).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(result.messages[0]?.role).toBe("user");
    if (result.messages[0]?.role === "user") {
      expect(result.messages[0].content).toContain("<conversation_summary>");
    }
    expect(result.messages.length).toBeLessThan(messages.length);
  });
});

describe("Agent Memory API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let agentId: string;
  let userId: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
    userId = admin.user.id as string;

    const createRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Memory Agent",
      systemPrompt: "You remember things",
    });
    expect(createRes.status).toBe(201);
    const agent = (await createRes.json()) as { id: string };
    agentId = agent.id;
  });

  afterAll(() => cleanup());

  test("GET /api/agents/:id/memory — empty", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      nodes: unknown[];
      edges: unknown[];
      branches: unknown[];
    };
    expect(data.nodes).toEqual([]);
    expect(data.edges).toEqual([]);
    expect(data.branches).toEqual([]);
  });

  test("POST /api/agents/:id/memory/nodes — create node", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/nodes`, {
      content: "Prefers TypeScript — uses Bun daily",
    });
    expect(res.status).toBe(201);
    const node = (await res.json()) as {
      id: string;
      content: string;
      ownerId: string;
    };
    expect(node.content).toBe("Prefers TypeScript — uses Bun daily");
    expect(node.ownerId).toBe(userId);

    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const data = (await list.json()) as {
      nodes: { id: string }[];
      branches: {
        ownerId: string;
        nodeCount: number;
        avatar: string | null;
        isGuest: boolean;
        sessions: { conversationId: string; nodeCount: number }[];
      }[];
    };
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0]!.id).toBe(node.id);
    expect(data.branches).toHaveLength(1);
    expect(data.branches[0]!.ownerId).toBe(userId);
    expect(data.branches[0]!.nodeCount).toBe(1);
    expect(data.branches[0]!.isGuest).toBe(false);
    expect(data.branches[0]!.sessions).toEqual([]);
    expect(data.branches[0]!.avatar).toBeDefined();
  });

  test("POST /api/agents/:id/memory/edges — link nodes with free-form relation", async () => {
    const project = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/nodes`, {
      content: "Nonla Agents",
    });
    expect(project.status).toBe(201);
    const projectNode = (await project.json()) as { id: string };

    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const { nodes } = (await list.json()) as { nodes: { id: string; content: string }[] };
    const pref = nodes.find((n) => n.content.includes("TypeScript"))!;

    const edgeRes = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/edges`, {
      fromId: pref.id,
      toId: projectNode.id,
      relation: "Works On",
    });
    expect(edgeRes.status).toBe(201);
    const edge = (await edgeRes.json()) as { id: string; relation: string };
    expect(edge.relation).toBe("works_on");

    const after = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const data = (await after.json()) as { edges: { id: string }[] };
    expect(data.edges.some((e) => e.id === edge.id)).toBe(true);
  });

  test("GET /api/agents/:id/memory — guest branch from public trigger", async () => {
    const fingerprint = "1f353c19-aaaa-bbbb-cccc-dddddddddddd";
    const pub = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, { isPublic: true });
    expect(pub.status).toBe(200);

    const convRes = await app.request(`/api/public/agents/${agentId}/conversations?fp=${fingerprint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(convRes.status).toBe(200);

    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/nodes`, {
      content: "Guest likes coffee",
      ownerId: fingerprint,
    });
    expect(res.status).toBe(201);

    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const data = (await list.json()) as {
      branches: { ownerId: string; label: string; isGuest: boolean; avatar: string | null }[];
    };
    const guest = data.branches.find((b) => b.ownerId === fingerprint);
    expect(guest).toBeDefined();
    expect(guest!.isGuest).toBe(true);
    expect(guest!.label).toBe("Guest · 1f353c19");
    expect(guest!.avatar).toBeNull();
  });

  test("GET /api/agents/:id/memory — unknown owner is not guest", async () => {
    const orphan = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/nodes`, {
      content: "Orphan note",
      ownerId: orphan,
    });
    expect(res.status).toBe(201);

    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const data = (await list.json()) as {
      branches: { ownerId: string; label: string; isGuest: boolean }[];
    };
    const branch = data.branches.find((b) => b.ownerId === orphan);
    expect(branch).toBeDefined();
    expect(branch!.isGuest).toBe(false);
    expect(branch!.label).toBe("aaaaaaaa");
  });

  test("PUT /api/agents/:id/memory/nodes/:nodeId — update", async () => {
    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const { nodes } = (await list.json()) as { nodes: { id: string; ownerId: string }[] };
    const nodeId = nodes.find((n) => n.ownerId === userId)!.id;

    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}/memory/nodes/${nodeId}`, {
      content: "Prefers TypeScript and Bun",
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { content: string };
    expect(updated.content).toBe("Prefers TypeScript and Bun");
  });

  test("DELETE node and edge", async () => {
    const list = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const data = (await list.json()) as { nodes: { id: string }[]; edges: { id: string }[] };

    for (const edge of data.edges) {
      const delEdge = await authRequest(app, token, "DELETE", `/api/agents/${agentId}/memory/edges/${edge.id}`);
      expect(delEdge.status).toBe(200);
    }

    for (const node of data.nodes) {
      const delNode = await authRequest(app, token, "DELETE", `/api/agents/${agentId}/memory/nodes/${node.id}`);
      expect(delNode.status).toBe(200);
    }

    const after = await authRequest(app, token, "GET", `/api/agents/${agentId}/memory`);
    const empty = (await after.json()) as { nodes: unknown[]; edges: unknown[]; branches: unknown[] };
    expect(empty.nodes).toHaveLength(0);
    expect(empty.edges).toHaveLength(0);
    expect(empty.branches).toHaveLength(0);
  });

  test("POST node — validation", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/memory/nodes`, { content: "  " });
    expect(res.status).toBe(400);
  });
});
