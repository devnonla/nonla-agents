import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Teams API", () => {
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

  let teamId = "";

  test("POST /api/teams — create team", async () => {
    const res = await authRequest(app, token, "POST", "/api/teams", {
      name: "Alpha Team",
      description: "The alpha squad",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Alpha Team");
    expect(data.description).toBe("The alpha squad");
    expect(data.id).toBeTruthy();
    teamId = data.id as string;
  });

  test("GET /api/teams — list teams", async () => {
    const res = await authRequest(app, token, "GET", "/api/teams");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(1);
    expect(data.items[0].name).toBe("Alpha Team");
    // Should have agentIds enrichment
    expect(data.items[0]).toHaveProperty("agentIds");
    expect(Array.isArray(data.items[0].agentIds)).toBe(true);
  });

  test("GET /api/teams — teams include agentIds for assigned agents", async () => {
    // Create an agent assigned to this team
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Team Agent",
      teamId,
    });
    const agent = (await agentRes.json()) as { id: string };

    const res = await authRequest(app, token, "GET", "/api/teams");
    const data = (await res.json()) as { items: { id: string; agentIds: string[] }[] };
    const team = data.items.find((t) => t.id === teamId);
    expect(team).toBeTruthy();
    expect(team!.agentIds).toContain(agent.id);
  });

  test("PUT /api/teams/:id — update team", async () => {
    const res = await authRequest(app, token, "PUT", `/api/teams/${teamId}`, {
      name: "Beta Team",
      description: "Now the beta squad",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Beta Team");
  });

  test("DELETE /api/teams/:id — delete team", async () => {
    // Create a separate team to delete
    const createRes = await authRequest(app, token, "POST", "/api/teams", {
      name: "Temp Team",
    });
    const temp = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "DELETE", `/api/teams/${temp.id}`);
    expect(res.status).toBe(200);

    // Verify deleted
    const listRes = await authRequest(app, token, "GET", "/api/teams");
    const data = (await listRes.json()) as { items: { id: string }[] };
    expect(data.items.find((t) => t.id === temp.id)).toBeUndefined();
  });
});
