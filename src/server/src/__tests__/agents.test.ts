import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Agents API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  // ── CRUD ──────────────────────────────────────────────────────────────

  let agentId = "";

  test("POST /api/agents — create agent", async () => {
    const res = await authRequest(app, token, "POST", "/api/agents", {
      name: "Test Agent",
      description: "A test agent",
      systemPrompt: "You are a helpful assistant.",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Test Agent");
    expect(data.description).toBe("A test agent");
    expect(data.id).toBeTruthy();
    expect(typeof data.avatar).toBe("string");
    expect((data.avatar as string).startsWith("{")).toBe(true);
    agentId = data.id as string;
  });

  test("GET /api/agents — list agents", async () => {
    const res = await authRequest(app, token, "GET", "/api/agents?page=1&limit=50");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.total).toBeGreaterThanOrEqual(1);

    // Should have enrichment fields; omit heavy/secret detail fields
    const agent = data.items.find((a) => a.id === agentId);
    expect(agent).toBeTruthy();
    expect(agent).toHaveProperty("toolCount");
    expect(agent).not.toHaveProperty("systemPrompt");
    expect(agent).not.toHaveProperty("systemPromptDraft");
    expect(agent).not.toHaveProperty("publicPassword");
    expect(agent).not.toHaveProperty("callableAgentIds");
  });

  test("GET /api/agents — search by name", async () => {
    const res = await authRequest(app, token, "GET", "/api/agents?search=Test");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/agents/:id — get single agent", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(agentId);
    expect(data.name).toBe("Test Agent");
  });

  test("GET /api/agents/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/agents/nonexistent-id");
    expect(res.status).toBe(400);
  });

  test("PUT /api/agents/:id — update agent", async () => {
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, {
      name: "Updated Agent",
      description: "Updated description",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Agent");
    expect(data.description).toBe("Updated description");
  });

  test("PUT /api/agents/:id — update avatar", async () => {
    const avatar = JSON.stringify({ sex: "man", faceColor: "#ff0000", bgColor: "#00ff00" });
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, { avatar });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.avatar).toBe(avatar);
  });

  test("PUT /api/agents/:id — systemPromptDraft does not change systemPrompt", async () => {
    const before = await authRequest(app, token, "GET", `/api/agents/${agentId}`);
    const beforeData = (await before.json()) as { systemPrompt: string | null };
    const published = beforeData.systemPrompt;

    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, {
      systemPromptDraft: "AI draft only — not published yet.",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { systemPrompt: string | null; systemPromptDraft: string | null };
    expect(data.systemPrompt).toBe(published);
    expect(data.systemPromptDraft).toBe("AI draft only — not published yet.");
  });

  test("PUT /api/agents/:id — publishing systemPrompt aligns draft", async () => {
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, {
      systemPrompt: "Approved prompt.",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { systemPrompt: string | null; systemPromptDraft: string | null };
    expect(data.systemPrompt).toBe("Approved prompt.");
    expect(data.systemPromptDraft).toBe("Approved prompt.");
  });

  test("PUT /api/agents/:id — discard draft restores published", async () => {
    await authRequest(app, token, "PUT", `/api/agents/${agentId}`, {
      systemPromptDraft: "Pending discard.",
    });
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}`, {
      systemPromptDraft: "Approved prompt.",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { systemPrompt: string | null; systemPromptDraft: string | null };
    expect(data.systemPrompt).toBe("Approved prompt.");
    expect(data.systemPromptDraft).toBe("Approved prompt.");
  });

  // ── Clone ─────────────────────────────────────────────────────────────

  let clonedId = "";

  test("POST /api/agents/:id/clone — clone agent", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/clone`);
    expect(res.status).toBe(201);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Agent (Copy)");
    expect(data.id).not.toBe(agentId);
    expect(data.avatar).toBe(JSON.stringify({ sex: "man", faceColor: "#ff0000", bgColor: "#00ff00" }));
    clonedId = data.id as string;
  });

  test("POST /api/agents/:id/clone — clone increments copy number", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/clone`);
    expect(res.status).toBe(201);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Agent (Copy 2)");
  });

  test("POST /api/agents/:id/clone — clone non-existent", async () => {
    const res = await authRequest(app, token, "POST", "/api/agents/nonexistent/clone");
    expect(res.status).toBe(400);
  });

  // ── Reorder / sortOrder ───────────────────────────────────────────────

  test("POST /api/agents — assigns sortOrder", async () => {
    const res = await authRequest(app, token, "POST", "/api/agents", { name: "Sort Agent" });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { sortOrder: number };
    expect(typeof data.sortOrder).toBe("number");
  });

  test("PUT /api/agents/reorder — reorder agents in a team", async () => {
    const teamRes = await authRequest(app, token, "POST", "/api/teams", { name: "Sort Team" });
    const team = (await teamRes.json()) as { id: string };

    const aRes = await authRequest(app, token, "POST", "/api/agents", { name: "Reorder A", teamId: team.id });
    const bRes = await authRequest(app, token, "POST", "/api/agents", { name: "Reorder B", teamId: team.id });
    const a = (await aRes.json()) as { id: string; sortOrder: number };
    const b = (await bRes.json()) as { id: string; sortOrder: number };
    expect(b.sortOrder).toBeLessThan(a.sortOrder);

    const reorderRes = await authRequest(app, token, "PUT", "/api/agents/reorder", {
      teamId: team.id,
      agentIds: [a.id, b.id],
    });
    expect(reorderRes.status).toBe(200);

    const getA = (await (await authRequest(app, token, "GET", `/api/agents/${a.id}`)).json()) as {
      sortOrder: number;
      teamId: string;
    };
    const getB = (await (await authRequest(app, token, "GET", `/api/agents/${b.id}`)).json()) as {
      sortOrder: number;
      teamId: string;
    };
    expect(getA.sortOrder).toBe(0);
    expect(getB.sortOrder).toBe(1);
    expect(getA.teamId).toBe(team.id);
    expect(getB.teamId).toBe(team.id);
  });

  test("PUT /api/agents/reorder — move agent to ungrouped", async () => {
    const teamRes = await authRequest(app, token, "POST", "/api/teams", { name: "Move Out" });
    const team = (await teamRes.json()) as { id: string };

    const createRes = await authRequest(app, token, "POST", "/api/agents", { name: "Move Ungrouped", teamId: team.id });
    const agent = (await createRes.json()) as { id: string };

    const reorderRes = await authRequest(app, token, "PUT", "/api/agents/reorder", {
      teamId: null,
      agentIds: [agent.id],
    });
    expect(reorderRes.status).toBe(200);

    const updated = (await (await authRequest(app, token, "GET", `/api/agents/${agent.id}`)).json()) as {
      teamId: string | null;
      sortOrder: number;
    };
    expect(updated.teamId).toBeNull();
    expect(updated.sortOrder).toBe(0);
  });

  // ── Tool Assignments ──────────────────────────────────────────────────

  test("GET /api/agents/:id/tool-assignments — empty initially", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as unknown[];
    expect(data.length).toBe(0);
  });

  test("POST /api/agents/:id/tool-assignments — add builtin tool", async () => {
    const res = await authRequest(app, token, "POST", `/api/agents/${agentId}/tool-assignments`, {
      toolId: "builtin:web_fetch",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.toolId).toBe("builtin:web_fetch");
  });

  test("GET /api/agents/:id/tool-assignments — has assigned tool", async () => {
    const res = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>[];
    expect(data.length).toBe(1);
    expect(data[0].toolId).toBe("builtin:web_fetch");
    expect(data[0]).toHaveProperty("tool");
  });

  test("DELETE /api/agents/:id/tool-assignments/:aid — remove assignment", async () => {
    // Get the assignment id first
    const listRes = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    const assignments = (await listRes.json()) as { id: string }[];
    const assignmentId = assignments[0].id;

    const res = await authRequest(app, token, "DELETE", `/api/agents/${agentId}/tool-assignments/${assignmentId}`);
    expect(res.status).toBe(200);

    // Verify removed
    const verifyRes = await authRequest(app, token, "GET", `/api/agents/${agentId}/tool-assignments`);
    const data = (await verifyRes.json()) as unknown[];
    expect(data.length).toBe(0);
  });

  test("PUT /api/agents/:id/tool-assignments — replace all", async () => {
    const res = await authRequest(app, token, "PUT", `/api/agents/${agentId}/tool-assignments`, {
      items: [{ toolId: "builtin:get_current_time" }, { toolId: "builtin:web_fetch" }],
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(data.length).toBe(2);
  });

  // ── Delete ────────────────────────────────────────────────────────────

  test("DELETE /api/agents/:id — delete agent", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/agents/${clonedId}`);
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await authRequest(app, token, "GET", `/api/agents/${clonedId}`);
    expect(getRes.status).toBe(400); // "Agent not found"
  });
});
