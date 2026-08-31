/** Virtual tool assignment id: datatable:{projectId} */

export const DATATABLE_PROJECT_ASSIGN_PREFIX = "datatable:";
export const DATATABLE_PROJECT_TOOL_PREFIX = "datatable__";
/** Legacy all-project assignment kept until a per-project tool is enabled. */
export const BUILTIN_DATATABLE_TOOL_ID = "builtin:datatable";

export function datatableProjectAssignmentId(projectId: string): string {
  return `${DATATABLE_PROJECT_ASSIGN_PREFIX}${projectId}`;
}

export function parseDatatableProjectAssignmentId(toolId: string): string | null {
  if (!toolId.startsWith(DATATABLE_PROJECT_ASSIGN_PREFIX)) return null;
  const id = toolId.slice(DATATABLE_PROJECT_ASSIGN_PREFIX.length).trim();
  return id || null;
}

export function datatableProjectToolName(projectId: string): string {
  return `${DATATABLE_PROJECT_TOOL_PREFIX}${projectId.replace(/-/g, "_")}`;
}

export function parseDatatableProjectToolTargetId(toolName: string): string | null {
  if (!toolName.startsWith(DATATABLE_PROJECT_TOOL_PREFIX)) return null;
  const raw = toolName.slice(DATATABLE_PROJECT_TOOL_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length !== 5) return null;
  return parts.join("-");
}

export function isDatatableProjectToolName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.startsWith(DATATABLE_PROJECT_TOOL_PREFIX);
}
