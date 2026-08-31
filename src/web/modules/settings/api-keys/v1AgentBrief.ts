export type V1AgentBriefScope = {
  agentsUnrestricted: boolean;
  agents: { id: string; name: string }[];
  datatablesUnrestricted: boolean;
  projects: { id: string; name: string }[];
  kvUnrestricted: boolean;
  kvKeys: string[];
};

export const API_KEY_PLACEHOLDER = "<NONLAAGENTS_API_KEY>";

export function toBriefScope(
  key: {
    agentsUnrestricted: boolean;
    agentIds: string[];
    datatablesUnrestricted: boolean;
    datatableProjectIds?: string[];
    kvUnrestricted: boolean;
    kvEntryIds?: string[];
  },
  agents: { id: string; name: string }[],
  projects: { id: string; name: string }[],
  kvEntries: { id: string; key: string }[],
): V1AgentBriefScope {
  return {
    agentsUnrestricted: key.agentsUnrestricted,
    agents: key.agentIds.map((id) => ({ id, name: agents.find((a) => a.id === id)?.name ?? id })),
    datatablesUnrestricted: key.datatablesUnrestricted,
    projects: (key.datatableProjectIds ?? []).map((id) => ({ id, name: projects.find((p) => p.id === id)?.name ?? id })),
    kvUnrestricted: key.kvUnrestricted,
    kvKeys: (key.kvEntryIds ?? []).map((id) => kvEntries.find((e) => e.id === id)?.key ?? id),
  };
}

function hasAgents(scope: V1AgentBriefScope): boolean {
  return scope.agentsUnrestricted || scope.agents.length > 0;
}

function hasDatatables(scope: V1AgentBriefScope): boolean {
  return scope.datatablesUnrestricted || scope.projects.length > 0;
}

function hasKv(scope: V1AgentBriefScope): boolean {
  return scope.kvUnrestricted || scope.kvKeys.length > 0;
}

function namedList(items: { id: string; name: string }[]): string {
  return items.map((item) => `- **${item.name}** — \`${item.id}\``).join("\n");
}

function agentsSection(scope: V1AgentBriefScope): string {
  const who = scope.agentsUnrestricted ? "This key can chat with **every agent**, including ones created later. List them first if you need an id." : `This key can only chat with these agents:\n\n${namedList(scope.agents)}\n\nPass \`agentId\` from the list above. Other agents return **403**.`;

  return `## Agents

${who}

\`GET /api/v1/agents\`

\`\`\`json
{ "items": [{ "id": "...", "name": "...", "description": "...", "avatar": "..." }] }
\`\`\`

\`POST /api/v1/chat\`

\`\`\`json
{ "agentId": "...", "message": "...", "conversationId": "...", "stream": true }
\`\`\`

- \`stream\` defaults to \`true\`. SSE frames are JSON.
- First event: \`{ "type": "conversation", "conversationId" }\`
- Then: \`text-delta\`, \`tool-call\`, \`tool-result\`, \`done\`, or \`error\`
- \`stream: false\` → \`{ "conversationId", "content", "status": "done"|"failed", "error?" }\`

\`POST /api/v1/chat/stop\`

\`\`\`json
{ "conversationId": "..." }
\`\`\``;
}

function datatablesSection(scope: V1AgentBriefScope): string {
  const who = scope.datatablesUnrestricted
    ? "This key can read and write **every datatable project**, including ones created later. `projectRef` and `tableRef` may be the resource id **or** its exact name."
    : `This key can only access these datatable projects:\n\n${namedList(scope.projects)}\n\n\`projectRef\` and \`tableRef\` may be the resource id **or** its exact name. Other projects return **403**.`;

  return `## Datatables

${who}

\`GET /api/v1/datatables\` — only projects this key can access.

\`GET /api/v1/datatables/{projectRef}/schema\`

\`POST /api/v1/datatables/{projectRef}/tables/{tableRef}/query\`

\`\`\`json
{
  "where": [
    { "status": "open", "age": { "$gte": 18 } },
    { "tag": { "$in": ["a", "b"] } }
  ],
  "order_by": [{ "key": "created_at", "dir": "desc" }],
  "limit": 50,
  "offset": 0
}
\`\`\`

\`where\` is either:

- **Object** — every column condition is **AND**
- **Array of objects** — **OR** of those groups (each group is AND)

There is no \`$or\` / \`$and\` key.

- Bare value → \`$eq\` (\`"status": "open"\` same as \`"status": { "$eq": "open" }\`)
- Operators: \`$eq\` \`$neq\` \`$gt\` \`$gte\` \`$lt\` \`$lte\` \`$in\` \`$nin\` \`$contains\` \`$exists\`
- \`$in\` / \`$nin\` take a non-empty array (match any value **in that column**)
- Several operators on the same column are AND (e.g. \`"age": { "$gte": 18, "$lt": 65 }\`)

Example object (AND): \`{ "status": "open", "age": { "$gte": 18 } }\`

Example array (OR): \`[{ "status": "open" }, { "age": { "$lt": 18 } }]\` → status is open **OR** age < 18.

Default \`limit\` 50, max 500. Default sort \`created_at DESC\`.

\`\`\`json
{ "items": [{ "id": "...", "tableId": "...", "data": {}, "createdAt": "...", "updatedAt": "..." }], "total": 0, "limit": 50, "offset": 0 }
\`\`\`

\`POST /api/v1/datatables/{projectRef}/tables/{tableRef}/rows\` → 201

\`\`\`json
{ "rows": [{ "columnName": "value" }] }
\`\`\`

\`PUT /api/v1/datatables/{projectRef}/tables/{tableRef}/rows/{rowId}\`

\`\`\`json
{ "data": { "columnName": "value" } }
\`\`\`

\`DELETE /api/v1/datatables/{projectRef}/tables/{tableRef}/rows\`

\`\`\`json
{ "rowIds": ["..."] }
\`\`\``;
}

function kvSection(scope: V1AgentBriefScope): string {
  const who = scope.kvUnrestricted ? "This key can read and write **every KV entry**. `PUT` on a missing key creates it (**201**)." : `This key can only read and update these KV keys:\n\n${scope.kvKeys.map((key) => `- \`${key}\``).join("\n")}\n\nIt cannot create new keys. Other keys return **403**.`;

  return `## KV

${who}

- \`GET /api/v1/kv\` → \`{ "items": [{ "key", "value", "description" }] }\`
- \`GET /api/v1/kv/{key}\`
- \`PUT /api/v1/kv/{key}\` body: \`{ "value": "...", "description": "..." }\`
- \`DELETE /api/v1/kv/{key}\``;
}

export function buildV1AgentBrief(opts: { origin: string; scope: V1AgentBriefScope }): string {
  const { origin, scope } = opts;
  const header = `# HTTP API

Self-hosted Nonla Agents. Do not use session cookies or JWT.

- **Base URL:** \`${origin}\`
- **Auth:** \`Authorization: Bearer ${API_KEY_PLACEHOLDER}\`

The secret starts with \`ra_\`. Invalid or missing key → **401**. Resource outside this key's scope → **403**. Unknown resource → **404**.`;

  const sections: string[] = [];
  if (hasAgents(scope)) sections.push(agentsSection(scope));
  if (hasDatatables(scope)) sections.push(datatablesSection(scope));
  if (hasKv(scope)) sections.push(kvSection(scope));

  if (sections.length === 0) {
    return `${header}

This key has no agent, datatable, or KV access. Grant a scope before calling the HTTP API.`;
  }

  return `${header}

${sections.join("\n\n")}`;
}
