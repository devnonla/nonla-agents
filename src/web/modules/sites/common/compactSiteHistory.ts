import type { ChatAgentMessage } from "src/components/chat/common/types";

function toolInputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

const SITE_FILE_LABELS: Record<string, string> = {
  "app.tsx": "UI",
  "styles.css": "Styles",
  "backend.ts": "Backend",
  "package.json": "Dependencies",
};

const LEGACY_EDIT_LABELS: Record<string, string> = {
  edit_ui: "UI",
  edit_styles: "Styles",
  edit_backend: "Backend",
  edit_deps: "Dependencies",
};

function siteFileLabel(file: unknown): string | null {
  return typeof file === "string" && file in SITE_FILE_LABELS ? SITE_FILE_LABELS[file] : null;
}

/** Live tool-chip label while the call is in flight / in the transcript. */
export function liveSiteToolLabel(toolName: string, input: unknown): string | null {
  const rec = toolInputRecord(input);
  if (toolName === "edit_site_files") {
    const surface = siteFileLabel(rec.file);
    return surface ? `Edit ${surface}` : null;
  }
  if (toolName in LEGACY_EDIT_LABELS) return `Edit ${LEGACY_EDIT_LABELS[toolName]}`;
  if (toolName === "read_site_files") {
    const surface = siteFileLabel(rec.file);
    if (surface) return `Read ${surface}`;
    if (typeof rec.file === "string" && rec.file) return "Read site source";
    const tree = typeof rec.tree === "string" ? rec.tree : "draft";
    return `Read ${tree} site files`;
  }
  return null;
}

export function summarizeSiteToolCall(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  const name = m.toolName ?? "";
  const input = toolInputRecord(m.toolInput);

  if (name === "edit_site_files") {
    const surface = siteFileLabel(input.file);
    return surface ? `Edited ${surface}` : "Edited site file";
  }
  if (name in LEGACY_EDIT_LABELS) return `Edited ${LEGACY_EDIT_LABELS[name]}`;
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
    const surface = siteFileLabel(input.file);
    if (surface) return `Read ${surface}`;
    if (typeof input.file === "string" && input.file) return "Read site source";
    const tree = typeof input.tree === "string" ? input.tree : "draft";
    return `Read ${tree} site files`;
  }
  if (name === "preview_site") return "Previewed site HTML";
  if (name === "datatable") return "Looked up datatable";
  if (name === "kv_store") return "Looked up KV store";
  if (name === "secrets") return "Looked up secrets";
  if (name === "web_fetch" || name === "fetch_url" || name === "browser") return "Fetched a URL";

  return null;
}

export function siteTurnSummaryHint(turn: ChatAgentMessage[]): string {
  const hasEdit = turn.some((m) => {
    if (m.role !== "tool-call" || !m.toolName) return false;
    return m.toolName === "edit_site_files" || m.toolName in LEGACY_EDIT_LABELS;
  });
  return hasEdit ? "\n\nClick **Approve** to promote draft → production." : "";
}
