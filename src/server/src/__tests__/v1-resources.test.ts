import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

function apiHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

describe("V1 Datatables and KV API", () => {
  let app: Hono;
  let cleanup: () => void;
  let adminToken: string;
  let projectId = "";
  let extraProjectId = "";
  let tableId = "";
  let kvId = "";
  let extraKvId = "";
  let selectedKey = "";
  let unrestrictedKey = "";
  let noneKey = "";

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    adminToken = admin.token;

    const p1 = await authRequest(app, adminToken, "POST", "/api/datatables/projects", { name: "CRM" });
    projectId = ((await p1.json()) as { id: string }).id;
    const p2 = await authRequest(app, adminToken, "POST", "/api/datatables/projects", { name: "HR" });
    extraProjectId = ((await p2.json()) as { id: string }).id;

    const tableRes = await authRequest(app, adminToken, "POST", `/api/datatables/projects/${projectId}/tables`, { name: "contacts" });
    tableId = ((await tableRes.json()) as { id: string }).id;
    await authRequest(app, adminToken, "POST", `/api/datatables/tables/${tableId}/columns`, { name: "email", type: "text" });
    await authRequest(app, adminToken, "POST", `/api/datatables/tables/${tableId}/rows`, { rows: [{ email: "a@example.com" }] });

    const kv1 = await authRequest(app, adminToken, "POST", "/api/kvstore", { key: "BASE_URL", value: "https://a.example" });
    kvId = ((await kv1.json()) as { id: string }).id;
    const kv2 = await authRequest(app, adminToken, "POST", "/api/kvstore", { key: "REGION", value: "us" });
    extraKvId = ((await kv2.json()) as { id: string }).id;

    const selected = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Scoped",
      datatableProjectIds: [projectId],
      kvEntryIds: [kvId],
    });
    selectedKey = ((await selected.json()) as { key: string }).key;

    const unrestricted = await authRequest(app, adminToken, "POST", "/api/api-keys", {
      name: "Open",
      datatablesUnrestricted: true,
      kvUnrestricted: true,
    });
    unrestrictedKey = ((await unrestricted.json()) as { key: string }).key;

    const none = await authRequest(app, adminToken, "POST", "/api/api-keys", { name: "Closed" });
    noneKey = ((await none.json()) as { key: string }).key;
  });

  afterAll(() => cleanup());

  test("GET /api/v1/datatables — selected lists only granted projects", async () => {
    const res = await app.request("/api/v1/datatables", { headers: apiHeaders(selectedKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string; name: string }[] };
    expect(data.items.map((p) => p.id)).toEqual([projectId]);
  });

  test("GET /api/v1/datatables — unrestricted lists all projects", async () => {
    const res = await app.request("/api/v1/datatables", { headers: apiHeaders(unrestrictedKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string }[] };
    expect(data.items.map((p) => p.id).sort()).toEqual([projectId, extraProjectId].sort());
  });

  test("GET /api/v1/datatables — none lists empty", async () => {
    const res = await app.request("/api/v1/datatables", { headers: apiHeaders(noneKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items).toEqual([]);
  });

  test("GET /api/v1/datatables/:id/schema — denied project returns 403", async () => {
    const res = await app.request(`/api/v1/datatables/${extraProjectId}/schema`, { headers: apiHeaders(selectedKey) });
    expect(res.status).toBe(403);
  });

  test("POST /api/v1/datatables/:id/tables/:table/query — selected can query", async () => {
    const res = await app.request(`/api/v1/datatables/${projectId}/tables/contacts/query`, {
      method: "POST",
      headers: apiHeaders(selectedKey),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { data: { email: string } }[]; total: number };
    expect(data.total).toBe(1);
    expect(data.items[0]?.data.email).toBe("a@example.com");
  });

  test("GET /api/v1/kv — selected lists only granted keys", async () => {
    const res = await app.request("/api/v1/kv", { headers: apiHeaders(selectedKey) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { key: string; value: string }[] };
    expect(data.items.map((i) => i.key)).toEqual(["BASE_URL"]);
    expect(data.items[0]?.value).toBe("https://a.example");
  });

  test("GET /api/v1/kv/:key — denied key returns 403", async () => {
    const res = await app.request("/api/v1/kv/REGION", { headers: apiHeaders(selectedKey) });
    expect(res.status).toBe(403);
    void extraKvId;
  });

  test("PUT /api/v1/kv/:key — selected can update granted key", async () => {
    const res = await app.request("/api/v1/kv/BASE_URL", {
      method: "PUT",
      headers: apiHeaders(selectedKey),
      body: JSON.stringify({ value: "https://b.example" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { key: string; value: string };
    expect(data.value).toBe("https://b.example");
  });

  test("PUT /api/v1/kv/:key — selected cannot create a new key", async () => {
    const res = await app.request("/api/v1/kv/NEW_KEY", {
      method: "PUT",
      headers: apiHeaders(selectedKey),
      body: JSON.stringify({ value: "nope" }),
    });
    expect(res.status).toBe(403);
  });

  test("PUT /api/v1/kv/:key — unrestricted can create a new key", async () => {
    const res = await app.request("/api/v1/kv/CREATED_VIA_API", {
      method: "PUT",
      headers: apiHeaders(unrestrictedKey),
      body: JSON.stringify({ value: "ok" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { key: string; value: string };
    expect(data.key).toBe("CREATED_VIA_API");
    expect(data.value).toBe("ok");
  });

  test("PUT /api/api-keys/:id — update datatable and kv scopes", async () => {
    const created = await authRequest(app, adminToken, "POST", "/api/api-keys", { name: "To update" });
    const temp = (await created.json()) as { id: string };
    const res = await authRequest(app, adminToken, "PUT", `/api/api-keys/${temp.id}`, {
      datatablesUnrestricted: true,
      kvEntryIds: [kvId],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { datatablesUnrestricted: boolean; kvEntryIds: string[]; kvUnrestricted: boolean };
    expect(data.datatablesUnrestricted).toBe(true);
    expect(data.kvUnrestricted).toBe(false);
    expect(data.kvEntryIds).toEqual([kvId]);
  });
});
