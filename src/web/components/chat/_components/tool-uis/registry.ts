import type { ComponentType } from "react";
import { isCallAgentToolName } from "../../common/utils";
import { CallAgentToolUI } from "./CallAgentToolUI";
import { GetCurrentTimeToolUI } from "./GetCurrentTimeToolUI";
import { GetToolSchemaToolUI } from "./GetToolSchemaToolUI";
import { ManageMemoryToolUI } from "./ManageMemoryToolUI";
import { ReadSkillToolUI } from "./ReadSkillToolUI";
import { RunCurrentScriptToolUI } from "./RunCurrentScriptToolUI";
import { RunJsToolUI } from "./RunJsToolUI";
import { WebFetchToolUI } from "./WebFetchToolUI";
import type { ToolUIProps } from "./types";

type ToolUIEntry = {
  match: (toolName: string) => boolean;
  component: ComponentType<ToolUIProps>;
};

const TOOL_UIS: ToolUIEntry[] = [
  { match: isCallAgentToolName, component: CallAgentToolUI },
  { match: (n) => n === "web_fetch" || n === "fetch_url" || n === "browser", component: WebFetchToolUI },
  { match: (n) => n === "get_current_time", component: GetCurrentTimeToolUI },
  { match: (n) => n === "get_tool_schema", component: GetToolSchemaToolUI },
  { match: (n) => n === "memory" || n === "user_memory" || n === "manage_memory", component: ManageMemoryToolUI },
  { match: (n) => n === "read_skill", component: ReadSkillToolUI },
  { match: (n) => n === "run_current_script", component: RunCurrentScriptToolUI },
  { match: (n) => n === "run_js", component: RunJsToolUI },
];

export function resolveToolUI(toolName: string | null | undefined): ComponentType<ToolUIProps> | null {
  if (!toolName) return null;
  for (const entry of TOOL_UIS) {
    if (entry.match(toolName)) return entry.component;
  }
  return null;
}
