import { stripDiacritics } from "../../common/utils/slug.js";

/** Virtual tool assignment id: mcp:{serverId}:{mcpToolName} */

export function buildMcpToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`;
}

export function isMcpToolId(toolId: string): boolean {
  return toolId.startsWith("mcp:");
}

export function parseMcpToolId(toolId: string): { serverId: string; toolName: string } | null {
  if (!toolId.startsWith("mcp:")) return null;
  const rest = toolId.slice(4);
  const idx = rest.indexOf(":");
  if (idx <= 0 || idx === rest.length - 1) return null;
  return { serverId: rest.slice(0, idx), toolName: rest.slice(idx + 1) };
}

/** LangGraph-safe tool name: {server}_{tool} */
export function buildMcpLangGraphName(serverName: string, toolName: string): string {
  const prefix = toSnakeCase(serverName);
  const suffix = toSnakeCase(toolName);
  return `${prefix}_${suffix}`;
}

function toSnakeCase(str: string): string {
  return stripDiacritics(str)
    .replace(/([A-Z])/g, "_$1")
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/_+/g, "_");
}
