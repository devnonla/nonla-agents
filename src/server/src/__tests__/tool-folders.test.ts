import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Tool Folders API", () => {
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

  let folderId = "";

  test("POST /api/tool-folders — create folder", async () => {
    const res = await authRequest(app, token, "POST", "/api/tool-folders", {
      name: "Integrations",
      description: "Third-party API tools",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Integrations");
    expect(data.description).toBe("Third-party API tools");
    expect(data.id).toBeTruthy();
    folderId = data.id as string;
  });

  test("GET /api/tool-folders — list folders with toolIds", async () => {
    const res = await authRequest(app, token, "GET", "/api/tool-folders");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    expect(data.items.length).toBe(1);
    expect(data.items[0].name).toBe("Integrations");
    expect(data.items[0]).toHaveProperty("toolIds");
    expect(Array.isArray(data.items[0].toolIds)).toBe(true);
  });

  test("GET /api/tool-folders — folders include toolIds for assigned tools", async () => {
    const toolRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "folder_tool",
      label: "Folder Tool",
      description: "Assigned to folder",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
      folderId,
    });
    const tool = (await toolRes.json()) as { id: string; folderId: string };
    expect(tool.folderId).toBe(folderId);

    const res = await authRequest(app, token, "GET", "/api/tool-folders");
    const data = (await res.json()) as { items: { id: string; toolIds: string[] }[] };
    const folder = data.items.find((f) => f.id === folderId);
    expect(folder).toBeTruthy();
    expect(folder!.toolIds).toContain(tool.id);
  });

  test("PUT /api/tool-folders/:id — update folder", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tool-folders/${folderId}`, {
      name: "APIs",
      description: "Updated description",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("APIs");
  });

  test("PUT /api/tool-folders/reorder — reorder folders", async () => {
    const aRes = await authRequest(app, token, "POST", "/api/tool-folders", { name: "Alpha" });
    const bRes = await authRequest(app, token, "POST", "/api/tool-folders", { name: "Beta" });
    const a = (await aRes.json()) as { id: string };
    const b = (await bRes.json()) as { id: string };

    const reorderRes = await authRequest(app, token, "PUT", "/api/tool-folders/reorder", {
      folderIds: [b.id, a.id, folderId],
    });
    expect(reorderRes.status).toBe(200);

    const listRes = await authRequest(app, token, "GET", "/api/tool-folders");
    const list = (await listRes.json()) as { items: { id: string; sortOrder: number }[] };
    expect(list.items.map((f) => f.id)).toEqual([b.id, a.id, folderId]);
    expect(list.items.map((f) => f.sortOrder)).toEqual([0, 1, 2]);
  });

  test("DELETE /api/tool-folders/:id — delete folder sets tools folderId null", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tool-folders", {
      name: "Temp Folder",
    });
    const temp = (await createRes.json()) as { id: string };

    const toolRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "temp_folder_tool",
      label: "Temp Folder Tool",
      description: "Will become ungrouped",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
      folderId: temp.id,
    });
    const tool = (await toolRes.json()) as { id: string };

    const res = await authRequest(app, token, "DELETE", `/api/tool-folders/${temp.id}`);
    expect(res.status).toBe(200);

    const getRes = await authRequest(app, token, "GET", `/api/tools/${tool.id}`);
    const updated = (await getRes.json()) as { folderId: string | null };
    expect(updated.folderId).toBeNull();
  });
});
