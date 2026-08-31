import type { ChatAgentMessage } from "src/components/chat/common/types";

function toolInputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

const SITE_EDIT_LABELS: Record<string, string> = {
  edit_ui: "Edited UI",
  edit_styles: "Edited Styles",
  edit_backend: "Edited Backend",
  edit_deps: "Edited Dependencies",
};

const SITE_READ_LABELS: Record<string, string> = {
  "app.tsx": "UI",
  "styles.css": "Styles",
  "backend.ts": "Backend",
  "package.json": "Dependencies",
};

export function summarizeSiteToolCall(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  const name = m.toolName ?? "";
  const input = toolInputRecord(m.toolInput);

  if (name in SITE_EDIT_LABELS) return SITE_EDIT_LABELS[name];
  if (name === "check_site") {
    let ok: boolean | undefined;
    if (typeof m.toolOutput === "string") {
      try {
        const parsed = JSON.parse(m.toolOutput) as { ok?: boolean };
        if (typeof parsed.ok === "boolean") ok = parsed.ok;
      } catch {
        /* ignore */
      }
    }
    if (ok === true) return "Validated draft (check_site ok)";
    if (ok === false) return "Validated draft (check_site failed)";
    return "Validated draft";
  }
  if (name === "read_site_files") {
    const file = typeof input.file === "string" ? input.file : "";
    if (file && SITE_READ_LABELS[file]) return `Read ${SITE_READ_LABELS[file]}`;
    if (file) return "Read site source";
    const tree = typeof input.tree === "string" ? input.tree : "draft";
    return `Read ${tree} site files`;
  }
  if (name === "preview_site") return "Previewed site HTML";
  if (name === "datatable") return "Looked up datatable";
  if (name === "kv_store") return "Looked up KV store";
  if (name === "secrets") return "Looked up secrets";
  if (name === "browser") return "Used browser tool";

  return null;
}

export function siteTurnSummaryHint(turn: ChatAgentMessage[]): string {
  const hasEdit = turn.some((m) => m.role === "tool-call" && !!m.toolName && m.toolName in SITE_EDIT_LABELS);
  return hasEdit ? "\n\nClick **Approve** to promote draft → production." : "";
}
