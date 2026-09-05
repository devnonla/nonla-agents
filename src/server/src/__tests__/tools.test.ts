import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Tools API", () => {
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

  // ── List (includes builtins) ──────────────────────────────────────────

  test("GET /api/tools — list includes builtin tools", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    // Should have at least the builtin tools (get_current_time, browser)
    expect(data.items.length).toBeGreaterThanOrEqual(1);

    // Verify builtin tools are present
    const builtinIds = data.items.map((t) => t.id).filter((id) => (id as string).startsWith("builtin:"));
    expect(builtinIds.length).toBeGreaterThanOrEqual(1);
    expect(builtinIds).toContain("builtin:browser");
    expect(builtinIds).toContain("builtin:fetch_url");
    expect(builtinIds).toContain("builtin:kv_store");
    expect(builtinIds).not.toContain("builtin:datatable");
    expect(builtinIds).not.toContain("builtin:secrets");
  });

  // ── Custom Tool CRUD ──────────────────────────────────────────────────

  let customToolId = "";

  test("POST /api/tools — create custom tool", async () => {
    const res = await authRequest(app, token, "POST", "/api/tools", {
      name: "test_tool",
      label: "Test Tool",
      description: "A tool for testing",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      codeContent: "// @name test_tool\n// @description A tool for testing\nexport default async function main(input: Record<string, unknown>) {\n  return { result: input.query };\n}\n",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("test_tool");
    expect(data.label).toBe("Test Tool");
    expect(data.id).toBeTruthy();
    customToolId = data.id as string;
  });

  test("GET /api/tools/:id — get custom tool", async () => {
    const res = await authRequest(app, token, "GET", `/api/tools/${customToolId}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe(customToolId);
    expect(data.name).toBe("test_tool");
    expect(data.codeContent).toBeTruthy();
  });

  test("GET /api/tools/:id — get builtin tool", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools/builtin:get_current_time");
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(data.id).toBe("builtin:get_current_time");
  });

  test("GET /api/tools/:id — not found", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools/nonexistent-id");
    expect(res.status).toBe(400);
  });

  test("PUT /api/tools/:id — update codeContent with valid code", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      codeContent: "// @name test_tool\n// @description Updated description\nexport default async function main(input: Record<string, unknown>) {\n  return { result: input.query };\n}\n",
    });

    expect(res.status).toBe(200);
  });

  test("POST /api/tools — duplicate name returns 400", async () => {
    const res = await authRequest(app, token, "POST", "/api/tools", {
      name: "test_tool",
      label: "Duplicate",
      description: "Should fail",
      codeContent: "// @name test_tool\n// @description Duplicate\nexport default async function main() {\n  return {};\n}\n",
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe("Tool name already exists");
  });

  test("PUT /api/tools/:id — rename to existing name returns 400", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "other_tool",
      label: "Other Tool",
      description: "Another tool",
      codeContent: "// @name other_tool\n// @description Another tool\nexport default async function main() {\n  return {};\n}\n",
    });
    expect(createRes.status).toBe(201);
    const other = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${other.id}`, {
      name: "test_tool",
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe("Tool name already exists");
  });

  test("PUT /api/tools/:id — update codeContent missing export default returns 400", async () => {
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      codeContent: "// @name test_tool\n// @description Some tool\nconst x = 1 + 2;",
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("export default");
  });

  test("PUT /api/tools/builtin:* — cannot modify builtin", async () => {
    const res = await authRequest(app, token, "PUT", "/api/tools/builtin:get_current_time", {
      label: "Hacked",
    });

    expect(res.status).toBe(500); // Throws error, caught by global handler
  });

  // ── Delete with cascade ───────────────────────────────────────────────

  test("DELETE /api/tools/:id — delete custom tool", async () => {
    // First create a second tool for delete test
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "deletable_tool",
      label: "Deletable",
      description: "Will be deleted",
      codeContent: "return {}",
    });
    const created = (await createRes.json()) as { id: string };

    // Create an agent and assign this tool
    const agentRes = await authRequest(app, token, "POST", "/api/agents", {
      name: "Agent with tool",
    });
    const agent = (await agentRes.json()) as { id: string };

    await authRequest(app, token, "POST", `/api/agents/${agent.id}/tool-assignments`, {
      toolId: created.id,
    });

    // Delete the tool
    const res = await authRequest(app, token, "DELETE", `/api/tools/${created.id}`);
    expect(res.status).toBe(200);

    // Verify tool is gone
    const getRes = await authRequest(app, token, "GET", `/api/tools/${created.id}`);
    expect(getRes.status).toBe(400);

    // Verify assignment is also removed
    const assignRes = await authRequest(app, token, "GET", `/api/agents/${agent.id}/tool-assignments`);
    const assignments = (await assignRes.json()) as unknown[];
    expect(assignments.length).toBe(0);
  });

  test("DELETE /api/tools/builtin:* — cannot delete builtin", async () => {
    const res = await authRequest(app, token, "DELETE", "/api/tools/builtin:get_current_time");
    expect(res.status).toBe(500); // Throws error
  });

  // ── List after operations ─────────────────────────────────────────────

  test("GET /api/tools — custom tool in list (without codeContent)", async () => {
    const res = await authRequest(app, token, "GET", "/api/tools");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { items: Record<string, unknown>[] };
    const customTool = data.items.find((t) => t.id === customToolId);
    expect(customTool).toBeTruthy();
    // List endpoint strips codeContent
    expect(customTool).not.toHaveProperty("codeContent");
  });

  // ── Reorder / sortOrder ───────────────────────────────────────────────

  test("POST /api/tools — assigns sortOrder", async () => {
    const res = await authRequest(app, token, "POST", "/api/tools", {
      name: "sort_tool_a",
      label: "Sort A",
      description: "A",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { sortOrder: number };
    expect(typeof data.sortOrder).toBe("number");
  });

  test("PUT /api/tools/reorder — reorder tools in a folder", async () => {
    const folderRes = await authRequest(app, token, "POST", "/api/tool-folders", { name: "Sort Folder" });
    const folder = (await folderRes.json()) as { id: string };

    const aRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "reorder_a",
      label: "Reorder A",
      description: "A",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
      folderId: folder.id,
    });
    const bRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "reorder_b",
      label: "Reorder B",
      description: "B",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
      folderId: folder.id,
    });
    const a = (await aRes.json()) as { id: string; sortOrder: number };
    const b = (await bRes.json()) as { id: string; sortOrder: number };
    expect(a.sortOrder).toBeLessThan(b.sortOrder);

    const reorderRes = await authRequest(app, token, "PUT", "/api/tools/reorder", {
      folderId: folder.id,
      toolIds: [b.id, a.id],
    });
    expect(reorderRes.status).toBe(200);

    const getA = (await (await authRequest(app, token, "GET", `/api/tools/${a.id}`)).json()) as {
      sortOrder: number;
      folderId: string;
    };
    const getB = (await (await authRequest(app, token, "GET", `/api/tools/${b.id}`)).json()) as {
      sortOrder: number;
      folderId: string;
    };
    expect(getB.sortOrder).toBe(0);
    expect(getA.sortOrder).toBe(1);
    expect(getA.folderId).toBe(folder.id);
    expect(getB.folderId).toBe(folder.id);
  });

  test("PUT /api/tools/reorder — move tool to ungrouped", async () => {
    const folderRes = await authRequest(app, token, "POST", "/api/tool-folders", { name: "Move Out" });
    const folder = (await folderRes.json()) as { id: string };

    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "move_ungrouped",
      label: "Move Ungrouped",
      description: "X",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
      folderId: folder.id,
    });
    const tool = (await createRes.json()) as { id: string };

    const reorderRes = await authRequest(app, token, "PUT", "/api/tools/reorder", {
      folderId: null,
      toolIds: [tool.id],
    });
    expect(reorderRes.status).toBe(200);

    const updated = (await (await authRequest(app, token, "GET", `/api/tools/${tool.id}`)).json()) as {
      folderId: string | null;
      sortOrder: number;
    };
    expect(updated.folderId).toBeNull();
    expect(updated.sortOrder).toBe(0);
  });

  test("PUT /api/tools/:id — Vietnamese @name keeps letters after stripping diacritics", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "placeholder_vn_tool",
      label: "Placeholder",
      description: "x",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: "// @name Công cụ tìm kiếm\n// @description Search helper\nexport default async function main() {\n  return { ok: true };\n}\n",
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { name: string; label: string };
    expect(updated.label).toBe("Công cụ tìm kiếm");
    expect(updated.name).toBe("cong_cu_tim_kiem");
  });

  test("PUT /api/tools/:id — code without @name/@description returns 400 (does not restore stored meta)", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "keep_meta_tool",
      label: "Keep Meta",
      description: "Stored description",
      parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      codeContent: "",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: "export default async function main(input: Record<string, unknown>) {\n  return { ok: true, q: input.q };\n}\n",
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("name");
    expect(data.message).toContain("description");
  });

  test("PUT /api/tools/:id — deleting @name returns 400 instead of restoring stored label", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "delete_name_tool",
      label: "Original Name",
      description: "Kept description",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "// @name Original Name\n// @description Kept description\nexport default async function main() {\n  return { ok: true };\n}\n",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: "// @description Kept description\nexport default async function main() {\n  return { ok: true };\n}\n",
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("name");
    expect(data.message).not.toContain("description");
  });

  test("PUT /api/tools/:id — publishing codeContent aligns a stale header-less draft", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "align_draft_tool",
      label: "Align Draft",
      description: "Stored description",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const bodyOnly = "export default async function main() {\n  return { ok: true };\n}\n";
    const draftRes = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, { draftCode: bodyOnly });
    expect(draftRes.status).toBe(200);
    const withDraft = (await draftRes.json()) as { draftCode: string };
    expect(withDraft.draftCode).toBe(bodyOnly);

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: `// @name Align Draft\n// @description Stored description\n${bodyOnly}`,
    });
    expect(res.status).toBe(200);
    const published = (await res.json()) as { codeContent: string; draftCode: string };
    expect(published.draftCode).toBe(published.codeContent);
    expect(published.codeContent).toContain("// @name Align Draft");
  });

  test("PUT /api/tools/:id — parses @param annotations into parameters on save", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "parse_params_tool",
      label: "Parse Params",
      description: "Will be overwritten",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: "// @name Search Things\n// @description Find things by query\n// @param {string} query (required) - Search text\n// @param {integer} limit (optional) - Max results\n\nexport default async function main(input: Record<string, unknown>) {\n  return { q: input.query };\n}\n",
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      label: string;
      description: string;
      name: string;
      parameters: { properties?: Record<string, { type?: string }>; required?: string[] };
    };
    expect(updated.label).toBe("Search Things");
    expect(updated.description).toBe("Find things by query");
    expect(updated.name).toBe("search_things");
    expect(updated.parameters.properties?.query?.type).toBe("string");
    expect(updated.parameters.properties?.limit?.type).toBe("integer");
    expect(updated.parameters.required).toEqual(["query"]);
  });

  test("PUT /api/tools/:id — code without description fails when DB description is empty", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/tools", {
      name: "empty_desc_tool",
      label: "Empty Desc",
      description: "",
      parameters: { type: "object", properties: {}, required: [] },
      codeContent: "",
    });
    expect(createRes.status).toBe(201);
    const tool = (await createRes.json()) as { id: string };

    const res = await authRequest(app, token, "PUT", `/api/tools/${tool.id}`, {
      codeContent: "export default async function main() {\n  return { ok: true };\n}\n",
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("description");
  });

  test("PUT /api/tools/:id — omitted compact placeholder is rejected", async () => {
    const { EDIT_PAYLOAD_OMITTED } = await import("../common/ai/apply-exact-replace.js");
    const res = await authRequest(app, token, "PUT", `/api/tools/${customToolId}`, {
      draftCode: EDIT_PAYLOAD_OMITTED,
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain("compacted edit placeholder");
  });
});
