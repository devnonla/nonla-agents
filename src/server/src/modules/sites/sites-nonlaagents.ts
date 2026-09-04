import { deleteRowsByName, getProjectSchemaByRef, insertRowsByName, listProjects, queryRowsByName, resolveProject, updateRowByName } from "../datatables/datatables.service.js";
import { deleteKvByKey, getKvByKey, listKvEntries, upsertKvByKey } from "../kvstore/kvstore.service.js";
import { getSecretValueByKey, listSecrets } from "../secrets/secrets.service.js";

function formatProjects(projects: { id: string; name: string }[]) {
  if (projects.length === 0) return "(none)";
  return projects.map((p) => `${p.name} [id=${p.id}]`).join(", ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** Accept query({ project, table, ... }) or query(project, table, opts). */
function parseProjectTableCall(projectOrOpts: unknown, tableArg?: unknown, optsArg?: unknown): { project: string; table: string; opts: Record<string, unknown> } {
  const bag = asRecord(projectOrOpts);
  if (bag && ("project" in bag || "table" in bag)) {
    return {
      project: String(bag.project ?? "").trim(),
      table: String(bag.table ?? "").trim(),
      opts: bag,
    };
  }
  return {
    project: String(projectOrOpts ?? "").trim(),
    table: String(tableArg ?? "").trim(),
    opts: asRecord(optsArg) ?? {},
  };
}

/** In-process nonlaagents bridge for site loader/action (same surface as custom tools). */
export function createSiteNonlaagents() {
  return {
    kv: {
      async get(key: string, defaultValue: unknown = null) {
        const k = String(key ?? "")
          .trim()
          .toUpperCase();
        const entry = await getKvByKey(k);
        return entry?.value ?? defaultValue;
      },
      async set(key: string, value: string) {
        if (typeof value !== "string") throw new Error("value must be a string");
        return await upsertKvByKey({ key, value });
      },
      async list() {
        const result = await listKvEntries({ limit: "1000" });
        return (result.items as { key: string; value: string }[]).map((e) => ({ key: e.key, value: e.value }));
      },
      async delete(key: string) {
        const k = String(key ?? "")
          .trim()
          .toUpperCase();
        return await deleteKvByKey(k);
      },
    },
    secrets: {
      async get(key: string) {
        const k = String(key ?? "")
          .trim()
          .toUpperCase();
        return await getSecretValueByKey(k);
      },
      async list() {
        const result = await listSecrets({ limit: "1000" });
        return (result.items as { key: string }[]).map((e) => e.key);
      },
    },
    datatable: {
      async list_projects() {
        return (await listProjects()).map((p) => ({ id: p.id, name: p.name }));
      },
      async get_schema(projectRef: string | { project?: string }) {
        const availableProjects = (await listProjects()).map((p) => ({ id: p.id, name: p.name }));
        const ref = typeof projectRef === "object" && projectRef ? String(projectRef.project ?? "").trim() : String(projectRef ?? "").trim();
        if (!ref) {
          throw new Error(`'project' is required (id or name). Available projects: ${formatProjects(availableProjects)}`);
        }
        const project = await resolveProject(ref);
        if (!project) {
          throw new Error(`Project "${ref}" not found. Available projects: ${formatProjects(availableProjects)}`);
        }
        const schema = await getProjectSchemaByRef(project.id);
        return {
          project: { id: schema.project.id, name: schema.project.name },
          tables: schema.tables.map((t) => ({
            id: t.id,
            name: t.name,
            columns: t.columns.map((c) => ({
              name: c.name,
              type: c.type,
              options: c.options,
              required: c.required,
            })),
          })),
        };
      },
      async query(projectOrOpts: unknown, table?: unknown, opts?: unknown) {
        const { project, table: tableRef, opts: o } = parseProjectTableCall(projectOrOpts, table, opts);
        if (!project || !tableRef) throw new Error("'project' and 'table' are required (id or name)");
        const result = await queryRowsByName(project, tableRef, {
          where: o.where as import("../datatables/datatable-where.util.js").WhereFilter | undefined,
          order_by: o.order_by as { key: string; dir?: "asc" | "desc" }[] | undefined,
          limit: typeof o.limit === "number" ? o.limit : undefined,
          offset: typeof o.offset === "number" ? o.offset : undefined,
        });
        // Alias rows → items for JS loaders that expect either name
        return { ...result, rows: result.items };
      },
      async insert(projectOrOpts: unknown, table?: unknown, rows?: unknown) {
        const bag = asRecord(projectOrOpts);
        if (bag && ("project" in bag || "table" in bag)) {
          const project = String(bag.project ?? "").trim();
          const tableRef = String(bag.table ?? "").trim();
          if (!project || !tableRef) throw new Error("'project' and 'table' are required (id or name)");
          return await insertRowsByName(project, tableRef, (bag.rows as Record<string, unknown>[]) ?? []);
        }
        const project = String(projectOrOpts ?? "").trim();
        const tableRef = String(table ?? "").trim();
        if (!project || !tableRef) throw new Error("'project' and 'table' are required (id or name)");
        return await insertRowsByName(project, tableRef, (rows as Record<string, unknown>[]) ?? []);
      },
      async update(projectOrOpts: unknown, table?: unknown, rowId?: unknown, data?: unknown) {
        const bag = asRecord(projectOrOpts);
        if (bag && ("project" in bag || "table" in bag)) {
          const project = String(bag.project ?? "").trim();
          const tableRef = String(bag.table ?? "").trim();
          const id = String(bag.row_id ?? bag.rowId ?? "").trim();
          if (!project || !tableRef || !id) throw new Error("'project', 'table', and 'row_id' are required");
          return await updateRowByName(project, tableRef, id, (bag.data as Record<string, unknown>) ?? {});
        }
        const project = String(projectOrOpts ?? "").trim();
        const tableRef = String(table ?? "").trim();
        const id = String(rowId ?? "").trim();
        if (!project || !tableRef || !id) throw new Error("'project', 'table', and 'row_id' are required");
        return await updateRowByName(project, tableRef, id, (data as Record<string, unknown>) ?? {});
      },
      async delete(projectOrOpts: unknown, table?: unknown, rowIds?: unknown) {
        const bag = asRecord(projectOrOpts);
        if (bag && ("project" in bag || "table" in bag)) {
          const project = String(bag.project ?? "").trim();
          const tableRef = String(bag.table ?? "").trim();
          if (!project || !tableRef) throw new Error("'project' and 'table' are required (id or name)");
          return await deleteRowsByName(project, tableRef, (bag.row_ids as string[]) ?? (bag.rowIds as string[]) ?? []);
        }
        const project = String(projectOrOpts ?? "").trim();
        const tableRef = String(table ?? "").trim();
        if (!project || !tableRef) throw new Error("'project' and 'table' are required (id or name)");
        return await deleteRowsByName(project, tableRef, (rowIds as string[]) ?? []);
      },
    },
  };
}

export type SiteNonlaagents = ReturnType<typeof createSiteNonlaagents>;
