/**
 * get_nonlaagents_guide — on-demand SDK reference for `import nonlaagents from "@nonla-agents/runtime"`.
 * Kept out of the system prompt so coding agents only pay for it when the script needs workspace APIs.
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

export const NONLAAGENTS_GUIDE_TOOL_NAME = "get_nonlaagents_guide";

export const NONLAAGENTS_GUIDE_FLAVORS = ["tools", "jobs", "sites"] as const;
export type NonlaagentsGuideFlavor = (typeof NONLAAGENTS_GUIDE_FLAVORS)[number];

const TOPIC_BY_FLAVOR = {
  tools: ["kv", "secrets", "datatable"],
  jobs: ["kv", "secrets", "datatable", "agents", "activity"],
  sites: ["kv", "secrets", "datatable"],
} as const satisfies Record<NonlaagentsGuideFlavor, readonly string[]>;

export type NonlaagentsGuideTopic = (typeof TOPIC_BY_FLAVOR)[NonlaagentsGuideFlavor][number];

const INTRO: Record<NonlaagentsGuideFlavor, string> = {
  tools: `Workspace SDK via \`import nonlaagents from "@nonla-agents/runtime"\`. Every call is async — always await.
Discover real keys/tables first with kv_store / secrets / datatable (list & schema only), then write runtime code.
Do NOT use ctx.kv / ctx.secrets / ctx.datatable.
Call style: positional args (object form also works).`,

  jobs: `Job SDK via \`import nonlaagents from "@nonla-agents/runtime"\`. Every RPC call is async — always await.
Discover real ids first (agents list, kv_store, secrets, datatable schema) — never invent them.
Call style: positional args (object form also works).
Wrap work in nonlaagents.step; use nonlaagents.log for the run timeline — not console.log.`,

  sites: `backend.ts handle() receives \`nonlaagents\` in-process (do not import the package).
Every call is async — always await. Prefer object form: query({ project, table, where }).
Discover real keys/tables first with kv_store / secrets / datatable (list & schema only).
Also use global fetch and Bun APIs. query returns { items, total } (items also aliased as rows).`,
};

const SECTION = {
  kv: `nonlaagents.kv:
  await nonlaagents.kv.get(key, default?) → value | default
  await nonlaagents.kv.set(key, value) → void   // value must be a string
  await nonlaagents.kv.list() → [{key, value}, ...]
  await nonlaagents.kv.delete(key) → void
Keys are UPPER_SNAKE_CASE (e.g. BASE_URL). Prefer secrets for credentials.
Example: const base = await nonlaagents.kv.get("BASE_URL", "https://example.com")`,

  secrets: `nonlaagents.secrets:
  await nonlaagents.secrets.get(key, default?) → value | default
  await nonlaagents.secrets.list() → key names only (values are not listed)
Secrets are read-only from code.
Example: const apiKey = await nonlaagents.secrets.get("API_KEY")`,

  datatable: `nonlaagents.datatable — projects → tables → rows.
project/table args accept **id (preferred)** or name.

  await nonlaagents.datatable.list_projects() → [{id, name}, ...]
  await nonlaagents.datatable.get_schema(project) → {project:{id,name}, tables:[{id, name, columns:[{name, type, options, required}, ...]}, ...]}
  await nonlaagents.datatable.query(project, table, { where, order_by, limit, offset })
      → {items:[{id, data, createdAt, updatedAt}, ...], total, limit, offset}
  await nonlaagents.datatable.insert(project, table, rows)  // rows = array of column→value objects
  await nonlaagents.datatable.update(project, table, row_id, data)  // data = partial column→value
  await nonlaagents.datatable.delete(project, table, row_ids)  // row_ids = string[]

Sites prefer object form:
  await nonlaagents.datatable.query({ project, table, where, order_by, limit, offset })

where examples:
  {status: "active"}                           // shorthand equality (AND if several keys)
  {age: {$gte: 18}, name: {$contains: "ann"}}
  [{status: "active"}, {age: {$lt: 18}}]       // OR of AND-groups
  {tags: {$contains: "vip"}, active: {$exists: true}}
Operators: $eq, $neq, $gt, $gte, $lt, $lte, $in, $nin, $contains, $exists
Object = AND. Array of objects = OR. No $or key.

order_by: list of {key, dir}. Always pass when sort matters.
  [{key: "created_at", dir: "desc"}]           // newest first (row timestamp)
  [{key: "name", dir: "asc"}]                  // schema column
key = column from get_schema, or created_at / updated_at. Param is order_by, not orderBy.

IMPORTANT:
  ✅ Discover with list_projects → get_schema(project_id) before insert/update
  ✅ Prefer ids from list/get_schema for subsequent calls (name still works)
  ✅ query returns items[]; each item has .id and .data (column values live under data)
  ❌ Do NOT invent project/table/column names — discover them first
  ❌ Do NOT read query result as result.rows (except sites, where rows aliases items)

Example — query + insert:
  import nonlaagents from "@nonla-agents/runtime";
  export default async function main(input: Record<string, unknown>) {
    const status = String(input.status ?? "active");
    const result = (await nonlaagents.datatable.query("CRM", "Customers", {
      where: { status },
      order_by: [{ key: "name", dir: "asc" }],
      limit: 20,
    })) as { items?: Array<{ id?: string; data?: Record<string, unknown> }>; total?: number };
    const customers = (result.items ?? []).map((r) => ({ id: r.id, ...(r.data ?? {}) }));
    return { customers, count: customers.length, total: result.total ?? 0 };
  }`,

  agents: `nonlaagents.agents:
  await nonlaagents.agents(agentId).run(message) → string (final agent reply)
Discover agent ids with the agents tool (action: list) — never invent ids.
Example: const reply = await nonlaagents.agents(id).run("Summarize today's leads")`,

  activity: `nonlaagents.step / nonlaagents.log — ACTIVITY TIMELINE (required for readable job runs):
  await nonlaagents.step("Fetch stories", async () => { ... })
    // Timed activity span. Shows as a bar on the run timeline with real duration.
    // Wrap each meaningful unit of work (fetch, parse, write DB, call agent, …).
  nonlaagents.log.info("optional detail")
  nonlaagents.log.warn("…")
  nonlaagents.log.error("…")
console.log still appears as unstructured output — do not rely on it for the timeline.`,
} as const;

function topicsFor(flavor: NonlaagentsGuideFlavor): readonly string[] {
  return TOPIC_BY_FLAVOR[flavor];
}

/** Pure guide text — used by the tool and tests. */
export function buildNonlaagentsGuide(flavor: NonlaagentsGuideFlavor, topic?: string | null): string {
  const allowed = topicsFor(flavor);
  const requested = topic?.trim() || "";
  const selected = requested ? [requested] : [...allowed];

  if (requested && !allowed.includes(requested)) {
    return `Unknown topic "${requested}". Use one of: ${allowed.join(", ")} (or omit topic for the full SDK).`;
  }

  const parts = [INTRO[flavor], "", ...selected.map((t) => SECTION[t as keyof typeof SECTION])];
  return parts.join("\n\n").trim();
}

function flavorDescription(flavor: NonlaagentsGuideFlavor): string {
  const topics = topicsFor(flavor).join(" | ");
  const when =
    flavor === "jobs"
      ? "Call BEFORE writing nonlaagents.kv / secrets / datatable / agents code. Skip when the script only needs step/log (already in the system prompt)."
      : flavor === "sites"
        ? "Call BEFORE writing nonlaagents.* in backend.ts. Skip for UI/CSS-only edits that do not touch workspace data."
        : "Call BEFORE writing code that uses nonlaagents.kv / secrets / datatable. Skip for simple fetch/JSON tools that do not touch workspace data.";

  return `Get the nonlaagents TypeScript SDK reference. ${when}
Optional topic: ${topics}. Omit topic for the full SDK. Call once per topic — do not re-fetch.`;
}

export function makeNonlaagentsGuideTool(flavor: NonlaagentsGuideFlavor): StructuredToolInterface {
  const allowed = topicsFor(flavor);
  const topicEnum = z.enum(allowed as unknown as [string, ...string[]]);

  return tool(async ({ topic }: { topic?: string }) => buildNonlaagentsGuide(flavor, topic), {
    name: NONLAAGENTS_GUIDE_TOOL_NAME,
    description: flavorDescription(flavor),
    schema: z.object({
      topic: topicEnum.optional().describe(`SDK section to return. Omit for the full ${flavor} SDK.`),
    }),
  });
}
