/**
 * resolveTools.ts — User agent tool resolver.
 *
 * Builds the full tool list for a user-created agent:
 *   - Builtin tools (directly imported)
 *   - Custom tools (from DB agent_tools table, Bun/TypeScript sandbox)
 *   - MCP tools (from mcp_servers.tools catalog via virtual assignment ids)
 *   - Datatable: legacy builtin:datatable (all projects) or datatable:{projectId} (locked)
 *   - Always-on: memory
 *   - call_agent__* tools (one per callableAgentIds target, top-level only)
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpCatalogTool, agentTools, agents, getDb, mcpServers, toolFolders } from "../../../../common/db/client.js";
import { BUILTIN_DATATABLE_TOOL_ID, isDatatableProjectToolName, parseDatatableProjectAssignmentId, parseDatatableProjectToolTargetId } from "../../../datatables/datatable-tool-id.js";
import { getProject } from "../../../datatables/datatables.service.js";
import { callMcpTool } from "../../../mcp-servers/mcp-client.js";
import { buildMcpLangGraphName, parseMcpToolId } from "../../../mcp-servers/mcp-tool-id.js";
import { runToolWithSoftWait } from "../../../tools/tools.service.js";

import { browserTool } from "../../../../common/ai/agent-tools/browser.tool.js";
import { fetchUrlTool } from "../../../../common/ai/agent-tools/fetch-url.tool.js";
import { makeBackgroundTasksTool } from "../llm-tools/background-tasks.tool.js";
import { type CallAgentTarget, isCallAgentToolName, makeCallAgentTools, parseCallAgentToolTargetId } from "../llm-tools/call-agent.tool.js";
import { datatableTool, makeDatatableProjectTool } from "../llm-tools/datatable.tool.js";
import { getCurrentTimeTool } from "../llm-tools/get-current-time.tool.js";
import { kvStoreTool } from "../llm-tools/kv-store.tool.js";
import { makeMemoryTool } from "../llm-tools/memory.tool.js";
import { makeReadSkillTool } from "../llm-tools/read-skill.tool.js";

import { CUSTOM_TOOL_SOFT_WAIT_MS } from "../../../tools/common/tool-runner.js";

const STATIC_BUILTINS: Record<string, StructuredToolInterface> = {
  get_current_time: getCurrentTimeTool,
  browser: browserTool,
  fetch_url: fetchUrlTool,
  kv_store: kvStoreTool,
};

export function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getToolLabel(toolName: string): string {
  if (isCallAgentToolName(toolName)) {
    return getCallAgentLabel({ agent_id: parseCallAgentToolTargetId(toolName) });
  }
  if (isDatatableProjectToolName(toolName)) {
    return getDatatableProjectLabel(parseDatatableProjectToolTargetId(toolName));
  }

  const KNOWN_LABELS: Record<string, string> = {
    get_current_time: "Get Current Time",
    browser: "Browser",
    fetch_url: "Fetch URL",
    kv_store: "KV Store",
    datatable: "Datatable",
    call_agent: "Call Agent",
    memory: "Memory",
    user_memory: "Memory",
    manage_memory: "Memory",
    read_skill: "Read Skill",
    get_tool_schema: "Get Tool Schema",
    background_tasks: "Background Tasks",
    edit_code: "Edit Code",
    run_current_script: "Run Current Script",
    get_nonlaagents_guide: "Nonlaagents SDK",
  };
  if (KNOWN_LABELS[toolName]) return KNOWN_LABELS[toolName];
  try {
    const db = getDb();
    const servers = db.select({ id: mcpServers.id, name: mcpServers.name, tools: mcpServers.tools }).from(mcpServers).all();
    for (const server of servers) {
      const catalog = (server.tools ?? []) as McpCatalogTool[];
      for (const t of catalog) {
        if (buildMcpLangGraphName(server.name, t.name) === toolName) {
          return `${server.name} → ${t.name}`;
        }
      }
    }
    const row = db.select({ label: agentTools.label, folderName: toolFolders.name }).from(agentTools).leftJoin(toolFolders, eq(agentTools.folderId, toolFolders.id)).where(eq(agentTools.name, toolName)).get();
    if (row) {
      const label = row.label && row.label !== toolName ? row.label : formatToolName(toolName);
      return row.folderName ? `${row.folderName} → ${label}` : label;
    }
  } catch {
    /* ignore */
  }
  return formatToolName(toolName);
}

/** SVG markup for a custom tool, or null for builtins/MCP/unknown. */
export function getToolIcon(toolName: string): string | null {
  try {
    const row = getDb().select({ icon: agentTools.icon }).from(agentTools).where(eq(agentTools.name, toolName)).get();
    const icon = row?.icon?.trim();
    if (icon?.startsWith("<svg")) return icon;
  } catch {
    /* ignore */
  }
  return null;
}

export function getCallAgentLabel(args: unknown): string {
  try {
    const agentId = (args as { agent_id?: string; agentId?: string; id?: string } | null)?.agent_id ?? (args as { agentId?: string } | null)?.agentId ?? (args as { id?: string } | null)?.id;
    if (!agentId || typeof agentId !== "string") return "Call Agent";
    const db = getDb();
    const row = db.select({ name: agents.name }).from(agents).where(eq(agents.id, agentId)).get();
    if (row?.name) return `Call ${row.name}`;
  } catch {
    /* ignore */
  }
  return "Call Agent";
}

function getDatatableProjectLabel(projectId: string | null): string {
  if (!projectId) return "Datatable";
  try {
    const project = getProject(projectId);
    if (project?.name) return `Datatable · ${project.name}`;
  } catch {
    /* ignore */
  }
  return "Datatable";
}

function buildZodSchema(parameters: object): z.ZodObject<Record<string, z.ZodType>> {
  const props = ((parameters as { properties?: Record<string, { type?: string; description?: string; default?: unknown }> })?.properties ?? {}) as Record<string, { type?: string; description?: string; default?: unknown }>;
  const required = ((parameters as { required?: string[] })?.required ?? []) as string[];
  const shape: Record<string, z.ZodType> = {};

  for (const [key, def] of Object.entries(props)) {
    let field: z.ZodType;
    switch (def.type) {
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.unknown());
        break;
      case "object":
        field = z.object({}).passthrough();
        break;
      default:
        field = z.string();
    }
    if (def.description) field = field.describe(def.description);
    if (def.default !== undefined) {
      field = field.optional().default(def.default) as z.ZodType;
    } else if (!required.includes(key)) {
      field = field.optional() as z.ZodType;
    }
    shape[key] = field;
  }

  return z.object(shape);
}

function buildCustomTool(
  record: {
    id: string;
    name: string;
    description: string;
    parameters: object;
    codeContent: string;
  },
  context: { agentId: string; conversationId?: string | null },
): StructuredToolInterface {
  const schema = buildZodSchema(record.parameters);

  return tool(
    async (input: unknown) => {
      try {
        const inputJson = JSON.stringify(input ?? {});
        const soft = await runToolWithSoftWait({
          id: record.id,
          inputJson,
          code: record.codeContent,
          softWaitMs: CUSTOM_TOOL_SOFT_WAIT_MS,
          agentId: context.agentId,
          conversationId: context.conversationId,
        });
        if (!soft) {
          return JSON.stringify({ error: `Custom tool "${record.name}" not found`, ok: false });
        }
        if (soft.status === "running") {
          return JSON.stringify({
            status: "running",
            taskId: soft.taskId,
            toolName: soft.toolName,
            message: "Still running in the background. Use background_tasks (await/get/list/cancel) with this taskId.",
          });
        }
        const result = JSON.parse(soft.payload) as { ok?: boolean; result?: unknown; error?: string };
        if (!result.ok) {
          return JSON.stringify({ error: result.error ?? `Custom tool "${record.name}" failed`, ok: false });
        }
        return JSON.stringify(result.result);
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err), ok: false });
      }
    },
    { name: record.name, description: record.description, schema },
  );
}

function buildMcpTool(opts: {
  langGraphName: string;
  description: string;
  parameters: object;
  serverId: string;
  mcpToolName: string;
  abortSignal?: AbortSignal;
}): StructuredToolInterface {
  const schema = buildZodSchema(opts.parameters);

  return tool(
    async (input: unknown) => {
      try {
        const db = getDb();
        const server = db.select().from(mcpServers).where(eq(mcpServers.id, opts.serverId)).get();
        if (!server) {
          return JSON.stringify({ error: `MCP server not found for tool "${opts.langGraphName}"`, ok: false });
        }
        if (!server.isActive) {
          return JSON.stringify({ error: `MCP server is inactive for tool "${opts.langGraphName}"`, ok: false });
        }

        const result = await callMcpTool(opts.serverId, server.url, (server.headers ?? {}) as Record<string, string>, opts.mcpToolName, (input ?? {}) as Record<string, unknown>, { abortSignal: opts.abortSignal });
        return typeof result === "string" ? result : JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err), ok: false });
      }
    },
    { name: opts.langGraphName, description: opts.description, schema },
  );
}

export type ResolveAgentToolsOptions = {
  callableAgents?: CallAgentTarget[];
  allowCallAgent?: boolean;
  abortSignal?: AbortSignal;
  /** Parent conversation — attached to nested call_agent usage rows. */
  conversationId?: string | null;
  enableMemory?: boolean;
};

/**
 * Resolve full tool list for a user agent.
 * @param enabledToolIds — assignment tool_id values (builtin:*, mcp:*, or custom UUID)
 */
export function resolveAgentTools(agentId: string, enabledToolIds: string[], ownerId: string, isGuest = false, options: ResolveAgentToolsOptions = {}): StructuredToolInterface[] {
  const db = getDb();
  const tools: StructuredToolInterface[] = [];
  const hasDatatableProject = enabledToolIds.some((id) => parseDatatableProjectAssignmentId(id));

  for (const toolId of enabledToolIds) {
    if (toolId.startsWith("builtin:")) {
      const name = toolId.slice("builtin:".length);
      // call_agent is no longer a single assignable builtin — injected via callableAgents below
      if (name === "call_agent") continue;
      if (toolId === BUILTIN_DATATABLE_TOOL_ID) {
        if (!hasDatatableProject) tools.push(datatableTool);
        continue;
      }
      if (name in STATIC_BUILTINS) {
        tools.push(STATIC_BUILTINS[name]);
      }
      continue;
    }

    const datatableProjectId = parseDatatableProjectAssignmentId(toolId);
    if (datatableProjectId) {
      const project = getProject(datatableProjectId);
      if (project) tools.push(makeDatatableProjectTool(project));
      continue;
    }

    const mcp = parseMcpToolId(toolId);
    if (mcp) {
      const server = db.select().from(mcpServers).where(eq(mcpServers.id, mcp.serverId)).get();
      if (!server || !server.isActive) continue;
      const catalog = (server.tools ?? []) as McpCatalogTool[];
      const def = catalog.find((t) => t.name === mcp.toolName);
      if (!def) continue;

      tools.push(
        buildMcpTool({
          langGraphName: buildMcpLangGraphName(server.name, def.name),
          description: def.description || `MCP tool from ${server.name}`,
          parameters: def.inputSchema,
          serverId: server.id,
          mcpToolName: def.name,
          abortSignal: options.abortSignal,
        }),
      );
      continue;
    }

    const row = db.select().from(agentTools).where(eq(agentTools.id, toolId)).get();
    if (row?.isActive) {
      tools.push(
        buildCustomTool(row, {
          agentId,
          conversationId: options.conversationId ?? null,
        }),
      );
    }
  }

  if (options.allowCallAgent !== false && options.callableAgents && options.callableAgents.length > 0) {
    tools.push(
      ...makeCallAgentTools({
        callerAgentId: agentId,
        targets: options.callableAgents,
        ownerId,
        isGuest,
        abortSignal: options.abortSignal,
        conversationId: options.conversationId ?? null,
        enableMemory: options.enableMemory,
      }),
    );
  }

  if (options.enableMemory !== false) {
    tools.push(makeMemoryTool(agentId, ownerId, isGuest, { conversationId: options.conversationId ?? null }));
  }
  tools.push(makeReadSkillTool(agentId));
  tools.push(makeBackgroundTasksTool({ agentId, conversationId: options.conversationId ?? null }));

  return tools;
}
