/**
 * TS package injected into each tool sandbox as `import nonlaagents from "@nonla-agents/runtime"`.
 * Also written under the legacy "nonlaagents" specifier for back-compat with tools saved before the rename.
 * Talks to the localhost proxy started by tool-runner.
 */

export const TOOLS_NONLAAGENTS_INDEX_TS = `const url = process.env.NONLAAGENTS_URL ?? "";
const token = process.env.NONLAAGENTS_TOKEN ?? "";

class NonlaagentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonlaagentsError";
  }
}

async function rpc(ns: string, action: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (!url || !token) throw new NonlaagentsError("nonlaagents runtime is not configured");
  const res = await fetch(\`\${url.replace(/\\/$/, "")}/\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nonlaagents-Token": token,
    },
    body: JSON.stringify({ ns, action, args }),
  });
  let data: { ok?: boolean; result?: unknown; error?: string };
  try {
    data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
  } catch {
    throw new NonlaagentsError(\`nonlaagents RPC failed: HTTP \${res.status}\`);
  }
  if (!data.ok) throw new NonlaagentsError(data.error || "nonlaagents call failed");
  return data.result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function parseProjectTableCall(
  projectOrOpts: unknown,
  tableArg?: unknown,
  optsArg?: unknown,
): { project: string; table: string; opts: Record<string, unknown> } {
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

const nonlaagents = {
  kv: {
    async get(key: string, defaultValue: unknown = null) {
      const result = await rpc("kv", "get", { key });
      return result ?? defaultValue;
    },
    async set(key: string, value: string) {
      if (typeof value !== "string") throw new NonlaagentsError("value must be a string");
      return rpc("kv", "set", { key, value });
    },
    async list() {
      return rpc("kv", "list");
    },
    async delete(key: string) {
      return rpc("kv", "delete", { key });
    },
  },
  secrets: {
    async get(key: string, defaultValue: unknown = null) {
      const result = await rpc("secrets", "get", { key });
      return result ?? defaultValue;
    },
    async list() {
      return rpc("secrets", "list");
    },
  },
  datatable: {
    async list_projects() {
      return rpc("datatable", "list_projects");
    },
    async get_schema(project: string) {
      return rpc("datatable", "get_schema", { project });
    },
    async query(projectOrOpts: unknown, tableArg?: unknown, optsArg?: unknown) {
      const { project, table, opts } = parseProjectTableCall(projectOrOpts, tableArg, optsArg);
      return rpc("datatable", "query", {
        project,
        table,
        where: opts.where,
        order_by: opts.order_by,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0,
      });
    },
    async insert(projectOrOpts: unknown, tableArg?: unknown, rowsArg?: unknown) {
      const bag = asRecord(projectOrOpts);
      if (bag && ("project" in bag || "table" in bag)) {
        return rpc("datatable", "insert", {
          project: String(bag.project ?? ""),
          table: String(bag.table ?? ""),
          rows: bag.rows ?? [],
        });
      }
      return rpc("datatable", "insert", {
        project: String(projectOrOpts ?? ""),
        table: String(tableArg ?? ""),
        rows: rowsArg ?? [],
      });
    },
    async update(projectOrOpts: unknown, tableArg?: unknown, rowIdArg?: unknown, dataArg?: unknown) {
      const bag = asRecord(projectOrOpts);
      if (bag && ("project" in bag || "table" in bag)) {
        return rpc("datatable", "update", {
          project: String(bag.project ?? ""),
          table: String(bag.table ?? ""),
          row_id: String(bag.row_id ?? ""),
          data: bag.data ?? {},
        });
      }
      return rpc("datatable", "update", {
        project: String(projectOrOpts ?? ""),
        table: String(tableArg ?? ""),
        row_id: String(rowIdArg ?? ""),
        data: dataArg ?? {},
      });
    },
    async delete(projectOrOpts: unknown, tableArg?: unknown, rowIdsArg?: unknown) {
      const bag = asRecord(projectOrOpts);
      if (bag && ("project" in bag || "table" in bag)) {
        return rpc("datatable", "delete", {
          project: String(bag.project ?? ""),
          table: String(bag.table ?? ""),
          row_ids: bag.row_ids ?? [],
        });
      }
      return rpc("datatable", "delete", {
        project: String(projectOrOpts ?? ""),
        table: String(tableArg ?? ""),
        row_ids: rowIdsArg ?? [],
      });
    },
  },
};

export default nonlaagents;
`;

export const TOOLS_NONLAAGENTS_PACKAGE_JSON = `{
  "name": "@nonla-agents/runtime",
  "version": "0.0.0",
  "type": "module",
  "main": "index.ts"
}
`;

/** Legacy bare specifier — kept so tools saved before the @nonla-agents/runtime rename still resolve. */
const TOOLS_NONLAAGENTS_LEGACY_PACKAGE_JSON = `{
  "name": "nonlaagents",
  "version": "0.0.0",
  "type": "module",
  "main": "index.ts"
}
`;

async function writeIfChanged(path: string, content: string): Promise<void> {
  try {
    if ((await Bun.file(path).text()) === content) return;
  } catch {
    /* missing */
  }
  await Bun.write(path, content);
}

export async function writeToolsNonlaagentsPackage(sandboxDir: string) {
  const dir = `${sandboxDir}/node_modules/@nonla-agents/runtime`;
  await writeIfChanged(`${dir}/package.json`, TOOLS_NONLAAGENTS_PACKAGE_JSON);
  await writeIfChanged(`${dir}/index.ts`, TOOLS_NONLAAGENTS_INDEX_TS);

  const legacyDir = `${sandboxDir}/node_modules/nonlaagents`;
  await writeIfChanged(`${legacyDir}/package.json`, TOOLS_NONLAAGENTS_LEGACY_PACKAGE_JSON);
  await writeIfChanged(`${legacyDir}/index.ts`, TOOLS_NONLAAGENTS_INDEX_TS);
}
