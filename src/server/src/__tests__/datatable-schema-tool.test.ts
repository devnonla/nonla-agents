import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PROJECT_ACTIONS, SCHEMA_ACTIONS, makeDatatableTool } from "../modules/agents/runtime/llm-tools/datatable.tool.js";
import { createTestApp, setupAdmin } from "./test-helpers.js";

describe("datatable schema tool", () => {
  let cleanup: () => void;
  let projectId = "";

  beforeAll(async () => {
    const t = await createTestApp();
    cleanup = t.cleanup;
    const { app } = t;
    await setupAdmin(app);

    const { createProject } = await import("../modules/datatables/datatables.service.js");
    projectId = (await createProject({ name: "SchemaToolProj" })).id as string;
  });

  afterAll(() => cleanup());

  test("create_table → create_column → update_column → delete_column → delete_table", async () => {
    const tool = makeDatatableTool(SCHEMA_ACTIONS, { lockedProjectId: projectId });

    const createdTableRaw = await tool.invoke({ action: "create_table", name: "orders" });
    const createdTable = JSON.parse(String(createdTableRaw)) as { ok: boolean; table: { id: string; name: string } };
    expect(createdTable.ok).toBe(true);
    expect(createdTable.table.name).toBe("orders");

    const createdColRaw = await tool.invoke({
      action: "create_column",
      table: "orders",
      name: "status",
      type: "select",
      options: ["open", "done"],
      required: true,
    });
    const createdCol = JSON.parse(String(createdColRaw)) as {
      ok: boolean;
      column: { id: string; name: string; type: string; options: string[]; required: boolean };
    };
    expect(createdCol.ok).toBe(true);
    expect(createdCol.column.type).toBe("select");
    expect(createdCol.column.options).toEqual(["open", "done"]);

    const updatedColRaw = await tool.invoke({
      action: "update_column",
      table: "orders",
      column: "status",
      name: "order_status",
      options: ["open", "shipped", "done"],
    });
    const updatedCol = JSON.parse(String(updatedColRaw)) as { ok: boolean; column: { name: string; options: string[] } };
    expect(updatedCol.ok).toBe(true);
    expect(updatedCol.column.name).toBe("order_status");
    expect(updatedCol.column.options).toEqual(["open", "shipped", "done"]);

    const renamedTableRaw = await tool.invoke({ action: "update_table", table: "orders", name: "shop_orders" });
    const renamedTable = JSON.parse(String(renamedTableRaw)) as { ok: boolean; table: { name: string } };
    expect(renamedTable.ok).toBe(true);
    expect(renamedTable.table.name).toBe("shop_orders");

    const deletedColRaw = await tool.invoke({ action: "delete_column", table: "shop_orders", column: "order_status" });
    const deletedCol = JSON.parse(String(deletedColRaw)) as { ok: boolean; deleted: { name: string } };
    expect(deletedCol.ok).toBe(true);
    expect(deletedCol.deleted.name).toBe("order_status");

    const deletedTableRaw = await tool.invoke({ action: "delete_table", table: "shop_orders" });
    const deletedTable = JSON.parse(String(deletedTableRaw)) as { ok: boolean; deleted: { name: string } };
    expect(deletedTable.ok).toBe(true);
    expect(deletedTable.deleted.name).toBe("shop_orders");

    const schemaRaw = await tool.invoke({ action: "get_schema" });
    const schema = JSON.parse(String(schemaRaw)) as { ok: boolean; tables: unknown[] };
    expect(schema.ok).toBe(true);
    expect(schema.tables).toHaveLength(0);
  });

  test("locked project rejects other project refs", async () => {
    const tool = makeDatatableTool(SCHEMA_ACTIONS, { lockedProjectId: projectId });
    const raw = await tool.invoke({ action: "create_table", project: "other-project", name: "x" });
    const result = JSON.parse(String(raw)) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("locked");
  });

  test("PROJECT_ACTIONS — insert → query → update → delete rows", async () => {
    const tool = makeDatatableTool(PROJECT_ACTIONS, { lockedProjectId: projectId });

    await tool.invoke({ action: "create_table", name: "items" });
    await tool.invoke({ action: "create_column", table: "items", name: "title", type: "text", required: true });

    const insertedRaw = await tool.invoke({
      action: "insert",
      table: "items",
      rows: [{ title: "alpha" }, { title: "beta" }],
    });
    const inserted = JSON.parse(String(insertedRaw)) as { ok: boolean; rows: { id: string; data: { title: string } }[] };
    expect(inserted.ok).toBe(true);
    expect(inserted.rows).toHaveLength(2);

    const queriedRaw = await tool.invoke({
      action: "query",
      table: "items",
      where: { title: "alpha" },
      order_by: [{ key: "title", dir: "asc" }],
    });
    const queried = JSON.parse(String(queriedRaw)) as { ok: boolean; items: { id: string; data: { title: string } }[]; total: number };
    expect(queried.ok).toBe(true);
    expect(queried.total).toBe(1);
    expect(queried.items[0].data.title).toBe("alpha");

    const rowId = queried.items[0].id;
    const updatedRaw = await tool.invoke({ action: "update", table: "items", row_id: rowId, data: { title: "alpha2" } });
    const updated = JSON.parse(String(updatedRaw)) as { ok: boolean; row: { data: { title: string } } };
    expect(updated.ok).toBe(true);
    expect(updated.row.data.title).toBe("alpha2");

    const deletedRaw = await tool.invoke({ action: "delete", table: "items", row_ids: [rowId] });
    const deleted = JSON.parse(String(deletedRaw)) as { ok: boolean; deleted?: number; count?: number };
    expect(deleted.ok).toBe(true);

    const afterRaw = await tool.invoke({ action: "query", table: "items" });
    const after = JSON.parse(String(afterRaw)) as { ok: boolean; total: number };
    expect(after.ok).toBe(true);
    expect(after.total).toBe(1);

    await tool.invoke({ action: "delete_table", table: "items" });
  });

  test("PROJECT_ACTIONS — preserves Vietnamese text on insert query update", async () => {
    const tool = makeDatatableTool(PROJECT_ACTIONS, { lockedProjectId: projectId });
    const original = "khoảng 211 nghìn, lạ hơn, ngoại nửa, phân bổ, lý nhỏ, vision png, trung, kênh: khác, các kênh ấy";
    const updated = `${original} — ${"ảầẫấậ ".repeat(200)}`;

    await tool.invoke({ action: "create_table", name: "vi_notes" });
    await tool.invoke({ action: "create_column", table: "vi_notes", name: "body", type: "text", required: true });

    const insertedRaw = await tool.invoke({ action: "insert", table: "vi_notes", rows: [{ body: original }] });
    const inserted = JSON.parse(String(insertedRaw)) as { ok: boolean; rows: { id: string; data: { body: string } }[] };
    expect(inserted.ok).toBe(true);
    expect(inserted.rows[0].data.body).toBe(original);

    const queriedRaw = await tool.invoke({ action: "query", table: "vi_notes" });
    const queried = JSON.parse(String(queriedRaw)) as { ok: boolean; items: { id: string; data: { body: string } }[] };
    expect(queried.ok).toBe(true);
    expect(queried.items[0].data.body).toBe(original);

    const updatedRaw = await tool.invoke({
      action: "update",
      table: "vi_notes",
      row_id: inserted.rows[0].id,
      data: { body: updated },
    });
    const updatedRow = JSON.parse(String(updatedRaw)) as { ok: boolean; row: { data: { body: string } } };
    expect(updatedRow.ok).toBe(true);
    expect(updatedRow.row.data.body).toBe(updated);

    const againRaw = await tool.invoke({ action: "query", table: "vi_notes" });
    const again = JSON.parse(String(againRaw)) as { ok: boolean; items: { data: { body: string } }[] };
    expect(again.items[0].data.body).toBe(updated);

    await tool.invoke({ action: "delete_table", table: "vi_notes" });
  });

  test("makeDatatableProjectTool — unique name, locked to project", async () => {
    const { createProject } = await import("../modules/datatables/datatables.service.js");
    const { datatableProjectToolName } = await import("../modules/datatables/datatable-tool-id.js");
    const { makeDatatableProjectTool } = await import("../modules/agents/runtime/llm-tools/datatable.tool.js");

    const other = await createProject({ name: "OtherLockedProj" });
    const tool = makeDatatableProjectTool({ id: projectId, name: "SchemaToolProj" });
    expect(tool.name).toBe(datatableProjectToolName(projectId));

    const schemaRaw = await tool.invoke({ action: "get_schema" });
    const schema = JSON.parse(String(schemaRaw)) as { ok: boolean; project: { id: string } };
    expect(schema.ok).toBe(true);
    expect(schema.project.id).toBe(projectId);

    const leakRaw = await tool.invoke({ action: "get_schema", project: other.id });
    const leak = JSON.parse(String(leakRaw)) as { ok: boolean; error: string };
    expect(leak.ok).toBe(false);
    expect(leak.error).toContain("locked");
    expect(tool.description).not.toContain("list_projects");
  });

  test("query description teaches order_by format", () => {
    const tool = makeDatatableTool(PROJECT_ACTIONS, { lockedProjectId: projectId });
    expect(tool.description).toContain("order_by");
    expect(tool.description).toContain('{"key": "created_at", "dir": "desc"}');
  });
});
