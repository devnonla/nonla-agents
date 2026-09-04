import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { COLUMN_TYPES } from "../../../../common/db/client.js";
import { HttpException } from "../../../../common/exceptions/http.exception.js";
import { datatableProjectToolName } from "../../../datatables/datatable-tool-id.js";
import { createColumn, createTable, deleteColumn, deleteRowsByName, deleteTable, getProjectSchemaByRef, insertRowsByName, listProjects, queryRowsByName, resolveColumnInTable, resolveProject, resolveProjectAndTable, updateColumn, updateRowByName, updateTable } from "../../../datatables/datatables.service.js";

export const DATA_ACTIONS = ["list_projects", "get_schema", "query", "insert", "update", "delete"] as const;
/** Row CRUD for a user-agent tool locked to one datatable project. */
export const PROJECT_DATA_ACTIONS = ["get_schema", "query", "insert", "update", "delete"] as const;
export const SCHEMA_ACTIONS = ["get_schema", "create_table", "update_table", "delete_table", "create_column", "update_column", "delete_column"] as const;
/** Schema + row CRUD for a locked project (datatable agent). */
export const PROJECT_ACTIONS = [...SCHEMA_ACTIONS, "query", "insert", "update", "delete"] as const;

const ALL_ACTIONS = ["list_projects", "get_schema", "query", "insert", "update", "delete", "create_table", "update_table", "delete_table", "create_column", "update_column", "delete_column"] as const;
export type DtAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<DtAction, string> = {
  list_projects: "**list_projects**: List all datatable projects (`id` + `name`). Prefer using returned `id` in later calls.",
  get_schema: "**get_schema**: Full project schema — all tables + columns. Requires `project` (id preferred, or name) unless the tool is project-locked.",
  query: '**query**: Query rows. Optional `where`, `order_by`, `limit`, `offset`. Requires `project` and `table`. Pass `order_by` whenever sort matters — e.g. `[{"key":"created_at","dir":"desc"}]` (newest) or a column from get_schema. Param is `order_by`, not `orderBy`.',
  insert: "**insert**: Insert rows. Requires `project`, `table`, and `rows` (array of objects).",
  update: "**update**: Update a row. Requires `project`, `table`, `row_id`, and `data`.",
  delete: "**delete**: Delete rows. Requires `project`, `table`, and `row_ids`.",
  create_table: "**create_table**: Create a table. Requires `project` and `name` (table name).",
  update_table: "**update_table**: Rename a table. Requires `project`, `table`, and `name` (new table name).",
  delete_table: "**delete_table**: Delete a table and its columns/rows. Requires `project` and `table`.",
  create_column: "**create_column**: Add a column. Requires `project`, `table`, `name`, `type` (text|number|boolean|datetime|select|json). For select, pass `options`. Optional `required`.",
  update_column: "**update_column**: Edit a column. Requires `project`, `table`, `column` (id or name). Optional `name`, `type`, `options`, `required`.",
  delete_column: "**delete_column**: Remove a column. Requires `project`, `table`, and `column` (id or name).",
};

export type MakeDatatableToolOptions = {
  /** When set, all ops are scoped to this project; `project` arg is optional. */
  lockedProjectId?: string;
  lockedProjectName?: string;
  /** LangGraph tool name (default: datatable). */
  name?: string;
};

async function availableProjectsPayload() {
  return (await listProjects()).map((p) => ({ id: p.id, name: p.name }));
}

function summarizeColumn(c: { id: string; name: string; type: string; options: string[] | null; required: boolean }) {
  return { id: c.id, name: c.name, type: c.type, options: c.options, required: c.required };
}

function summarizeTable(t: { id: string; name: string }) {
  return { id: t.id, name: t.name };
}

export function makeDatatableTool(actions: readonly DtAction[] = DATA_ACTIONS, options: MakeDatatableToolOptions = {}): StructuredToolInterface {
  const allowed = actions.length > 0 ? actions : DATA_ACTIONS;
  const lockedProjectId = options.lockedProjectId?.trim() || undefined;
  const lockedProjectName = options.lockedProjectName?.trim() || undefined;
  const toolName = options.name?.trim() || "datatable";
  const lockedLabel = lockedProjectName ? `"${lockedProjectName}"` : lockedProjectId ? `"${lockedProjectId}"` : "";
  const lockedHint = lockedProjectId ? `\nThis tool is locked to datatable project ${lockedLabel} (id \`${lockedProjectId}\`). Omit \`project\` or pass that id.` : "";

  const queryHints = `where: object = AND of columns; array of objects = OR of those groups.
examples: {"status": "active", "age": {"$gte": 18}}
  or [{"status": "active"}, {"age": {"$lt": 18}}]
order_by examples: [{"key": "created_at", "dir": "desc"}] or [{"key": "<column>", "dir": "asc"}]
  key = column name from get_schema, or created_at / updated_at (row timestamps). dir: "asc"|"desc" (default desc). Use order_by on query when listing, ranking, or fetching newest/oldest rows.`;

  const description = lockedProjectId
    ? `Read and write tables in datatable project ${lockedLabel}.

Discovery flow:
1. get_schema — tables + columns in this project
2. mutate rows with table id or name from get_schema

Pass table/column as **id** (preferred) or **name**.${lockedHint}

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}

${queryHints}`
    : `Read and write workspace datatables (projects → tables → columns → rows).

Discovery flow:
1. list_projects → get_schema(project)
2. mutate with ids from get_schema when possible

Pass project/table/column as **id** (preferred) or **name**.

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}

${queryHints}`;

  return tool(
    async ({
      action,
      project,
      table,
      column,
      name,
      type,
      options: columnOptions,
      required,
      where,
      order_by,
      limit,
      offset,
      rows,
      row_id,
      row_ids,
      data,
    }: {
      action: string;
      project?: string;
      table?: string;
      column?: string;
      name?: string;
      type?: string;
      options?: string[];
      required?: boolean;
      where?: Record<string, unknown> | Record<string, unknown>[];
      order_by?: { key: string; dir?: "asc" | "desc" }[];
      limit?: number;
      offset?: number;
      rows?: Record<string, unknown>[];
      row_id?: string;
      row_ids?: string[];
      data?: Record<string, unknown>;
    }) => {
      try {
        if (!(allowed as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${allowed.join(", ")}.` });
        }

        const resolveScopedProject = async () => {
          if (lockedProjectId) {
            if (project?.trim() && project.trim() !== lockedProjectId) {
              const byName = await resolveProject(project);
              if (!byName || byName.id !== lockedProjectId) {
                return {
                  error: JSON.stringify({
                    ok: false,
                    error: `This tool is locked to project "${lockedProjectId}". Do not pass a different project.`,
                  }),
                };
              }
            }
            const p = await resolveProject(lockedProjectId);
            if (!p) {
              return { error: JSON.stringify({ ok: false, error: `Locked project "${lockedProjectId}" not found.` }) };
            }
            return { project: p };
          }

          if (!project?.trim()) {
            return {
              error: JSON.stringify({
                ok: false,
                error: "'project' is required (id preferred, or name).",
                available_projects: await availableProjectsPayload(),
              }),
            };
          }
          const p = await resolveProject(project);
          if (!p) {
            return {
              error: JSON.stringify({
                ok: false,
                error: `Project "${project.trim()}" not found. Use an id or name from available_projects.`,
                available_projects: await availableProjectsPayload(),
              }),
            };
          }
          return { project: p };
        };

        if (action === "list_projects") {
          if (lockedProjectId) {
            const p = await resolveProject(lockedProjectId);
            return JSON.stringify({ ok: true, projects: p ? [{ id: p.id, name: p.name }] : [] });
          }
          return JSON.stringify({ ok: true, projects: await availableProjectsPayload() });
        }

        if (action === "get_schema") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          const schema = await getProjectSchemaByRef(scoped.project.id);
          return JSON.stringify({
            ok: true,
            project: { id: schema.project.id, name: schema.project.name },
            tables: schema.tables.map((t) => ({
              id: t.id,
              name: t.name,
              columns: t.columns.map((c) => summarizeColumn(c)),
            })),
          });
        }

        if (action === "query") {
          if (!project?.trim() || !table?.trim()) {
            if (lockedProjectId && table?.trim()) {
              const result = await queryRowsByName(lockedProjectId, table.trim(), { where, order_by, limit, offset });
              return JSON.stringify({ ok: true, ...result });
            }
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          const result = await queryRowsByName(project.trim(), table.trim(), { where, order_by, limit, offset });
          return JSON.stringify({ ok: true, ...result });
        }

        if (action === "insert") {
          const projectRef = project?.trim() || lockedProjectId;
          if (!projectRef || !table?.trim()) {
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          if (!Array.isArray(rows) || rows.length === 0) {
            return JSON.stringify({ ok: false, error: "'rows' must be a non-empty array." });
          }
          const created = await insertRowsByName(projectRef, table.trim(), rows);
          return JSON.stringify({ ok: true, rows: created });
        }

        if (action === "update") {
          const projectRef = project?.trim() || lockedProjectId;
          if (!projectRef || !table?.trim() || !row_id?.trim()) {
            return JSON.stringify({ ok: false, error: "'project', 'table', and 'row_id' are required." });
          }
          if (!data || typeof data !== "object") {
            return JSON.stringify({ ok: false, error: "'data' object is required." });
          }
          const updated = await updateRowByName(projectRef, table.trim(), row_id.trim(), data);
          return JSON.stringify({ ok: true, row: updated });
        }

        if (action === "delete") {
          const projectRef = project?.trim() || lockedProjectId;
          if (!projectRef || !table?.trim()) {
            return JSON.stringify({ ok: false, error: "'project' and 'table' are required (id or name)." });
          }
          if (!Array.isArray(row_ids) || row_ids.length === 0) {
            return JSON.stringify({ ok: false, error: "'row_ids' must be a non-empty array." });
          }
          const result = await deleteRowsByName(projectRef, table.trim(), row_ids);
          return JSON.stringify({ ok: true, ...result });
        }

        if (action === "create_table") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!name?.trim()) {
            return JSON.stringify({ ok: false, error: "'name' is required for create_table." });
          }
          const created = await createTable(scoped.project.id, { name: name.trim() });
          return JSON.stringify({ ok: true, table: { id: created.id as string, name: created.name } });
        }

        if (action === "update_table") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!table?.trim() || !name?.trim()) {
            return JSON.stringify({ ok: false, error: "'table' and 'name' are required for update_table." });
          }
          const found = await resolveProjectAndTable(scoped.project.id, table.trim());
          if (!found) {
            return JSON.stringify({ ok: false, error: `Table "${table.trim()}" not found in this project.` });
          }
          const updated = await updateTable(found.table.id, { name: name.trim() });
          return JSON.stringify({ ok: true, table: { id: updated.id, name: updated.name } });
        }

        if (action === "delete_table") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!table?.trim()) {
            return JSON.stringify({ ok: false, error: "'table' is required for delete_table." });
          }
          const found = await resolveProjectAndTable(scoped.project.id, table.trim());
          if (!found) {
            return JSON.stringify({ ok: false, error: `Table "${table.trim()}" not found in this project.` });
          }
          await deleteTable(found.table.id);
          return JSON.stringify({ ok: true, deleted: { id: found.table.id, name: found.table.name } });
        }

        if (action === "create_column") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!table?.trim() || !name?.trim() || !type?.trim()) {
            return JSON.stringify({
              ok: false,
              error: "'table', 'name', and 'type' are required for create_column.",
            });
          }
          const found = await resolveProjectAndTable(scoped.project.id, table.trim());
          if (!found) {
            return JSON.stringify({ ok: false, error: `Table "${table.trim()}" not found in this project.` });
          }
          const created = await createColumn(found.table.id, {
            name: name.trim(),
            type: type.trim(),
            options: columnOptions,
            required,
          });
          return JSON.stringify({
            ok: true,
            column: summarizeColumn({
              id: created.id as string,
              name: created.name,
              type: created.type,
              options: created.options ?? null,
              required: Boolean(created.required),
            }),
            table: summarizeTable(found.table),
          });
        }

        if (action === "update_column") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!table?.trim() || !column?.trim()) {
            return JSON.stringify({ ok: false, error: "'table' and 'column' are required for update_column." });
          }
          const found = await resolveProjectAndTable(scoped.project.id, table.trim());
          if (!found) {
            return JSON.stringify({ ok: false, error: `Table "${table.trim()}" not found in this project.` });
          }
          const col = await resolveColumnInTable(found.table.id, column.trim());
          if (!col) {
            return JSON.stringify({ ok: false, error: `Column "${column.trim()}" not found on table "${found.table.name}".` });
          }
          if (name === undefined && type === undefined && columnOptions === undefined && required === undefined) {
            return JSON.stringify({
              ok: false,
              error: "Provide at least one of: name, type, options, required.",
            });
          }
          const updated = await updateColumn(col.id, {
            name,
            type,
            options: columnOptions,
            required,
          });
          return JSON.stringify({ ok: true, column: summarizeColumn(updated), table: summarizeTable(found.table) });
        }

        if (action === "delete_column") {
          const scoped = await resolveScopedProject();
          if ("error" in scoped) return scoped.error;
          if (!table?.trim() || !column?.trim()) {
            return JSON.stringify({ ok: false, error: "'table' and 'column' are required for delete_column." });
          }
          const found = await resolveProjectAndTable(scoped.project.id, table.trim());
          if (!found) {
            return JSON.stringify({ ok: false, error: `Table "${table.trim()}" not found in this project.` });
          }
          const col = await resolveColumnInTable(found.table.id, column.trim());
          if (!col) {
            return JSON.stringify({ ok: false, error: `Column "${column.trim()}" not found on table "${found.table.name}".` });
          }
          await deleteColumn(col.id);
          return JSON.stringify({
            ok: true,
            deleted: { id: col.id, name: col.name },
            table: summarizeTable(found.table),
          });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        const message = err instanceof HttpException ? err.message : err instanceof Error ? err.message : String(err);
        if (project?.trim() && !(await resolveProject(project)) && /project|table/i.test(message)) {
          return JSON.stringify({
            ok: false,
            error: message,
            available_projects: await availableProjectsPayload(),
          });
        }
        return JSON.stringify({ ok: false, error: message });
      }
    },
    {
      name: toolName,
      description,
      schema: z.object({
        action: z.enum(allowed as unknown as [string, ...string[]]).describe("Operation to perform"),
        project: z.string().optional().describe("Project id (preferred) or name"),
        table: z.string().optional().describe("Table id (preferred) or name"),
        column: z.string().optional().describe("Column id (preferred) or name — for update_column/delete_column"),
        name: z.string().optional().describe("Table or column name (create/update)"),
        type: z.enum(COLUMN_TYPES).optional().describe("Column type for create_column/update_column"),
        options: z.array(z.string()).optional().describe("Select options (create_column/update_column when type=select)"),
        required: z.boolean().optional().describe("Whether the column is required"),
        where: z
          .union([z.record(z.string(), z.any()), z.array(z.record(z.string(), z.any()))])
          .optional()
          .describe("Filter: object = AND; array of objects = OR of those AND-groups"),
        order_by: z
          .array(z.object({ key: z.string(), dir: z.enum(["asc", "desc"]).optional() }))
          .optional()
          .describe('Sort as [{key, dir}]. key = schema column, or "created_at"/"updated_at". Example: [{"key":"created_at","dir":"desc"}]'),
        limit: z.number().optional().describe("Max rows (default 50)"),
        offset: z.number().optional().describe("Offset for pagination"),
        rows: z.array(z.record(z.string(), z.any())).optional().describe("Rows to insert"),
        row_id: z.string().optional().describe("Row id for update"),
        row_ids: z.array(z.string()).optional().describe("Row ids for delete"),
        data: z.record(z.string(), z.any()).optional().describe("Partial data for update"),
      }),
    },
  );
}

export function makeDatatableProjectTool(project: { id: string; name: string }): StructuredToolInterface {
  return makeDatatableTool(PROJECT_DATA_ACTIONS, {
    lockedProjectId: project.id,
    lockedProjectName: project.name,
    name: datatableProjectToolName(project.id),
  });
}

export const datatableTool = makeDatatableTool();

export const TOOL_DEF = {
  toolName: "datatable",
  toolLabel: "Datatable",
  description: "Query and mutate workspace datatables. Discovery: list_projects → get_schema(project). Prefer ids. Query supports where + order_by ([{key, dir}], e.g. created_at desc).",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...DATA_ACTIONS] },
      project: { type: "string", description: "Project id (preferred) or name" },
      table: { type: "string", description: "Table id (preferred) or name — for query/insert/update/delete" },
      where: { type: "object", additionalProperties: true },
      order_by: {
        type: "array",
        description: 'Sort as [{key, dir}]. key = schema column or created_at/updated_at. Example: [{"key":"created_at","dir":"desc"}]',
        items: {
          type: "object",
          properties: { key: { type: "string" }, dir: { type: "string", enum: ["asc", "desc"] } },
          required: ["key"],
        },
      },
      limit: { type: "number" },
      offset: { type: "number" },
      rows: { type: "array", items: { type: "object" } },
      row_id: { type: "string" },
      row_ids: { type: "array", items: { type: "string" } },
      data: { type: "object", additionalProperties: true },
    },
    required: ["action"],
  },
};
