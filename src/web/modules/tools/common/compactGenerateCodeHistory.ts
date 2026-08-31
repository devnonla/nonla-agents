import type { ChatAgentMessage } from "src/components/chat/common/types";

export function summarizeCodingToolCall(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  const name = m.toolName ?? "";

  if (name === "edit_code") return "Updated draft script";
  if (name === "run_current_job") return "Started a job run";
  if (name === "run_current_script") return "Ran current script";
  if (name === "get_job_run") return "Fetched job run";
  if (name === "datatable") return "Looked up datatable";
  if (name === "kv_store") return "Looked up KV store";
  if (name === "secrets") return "Looked up secrets";
  if (name === "browser") return "Used browser tool";
  if (name === "agents") return "Looked up agents";

  return null;
}
