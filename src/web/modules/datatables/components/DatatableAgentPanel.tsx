import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { AgentPanel } from "src/components/chat/_components/AgentPanel";
import type { ChatAgentMessage } from "src/components/chat/common/types";

export type { ToolActionEvent };

function toolInputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function summarizeDatatableToolCall(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  if (m.toolName !== "datatable") return null;
  const input = toolInputRecord(m.toolInput);
  const action = typeof input.action === "string" ? input.action : "";
  if (!action) return "datatable";
  const target = (typeof input.name === "string" && input.name) || (typeof input.column === "string" && input.column) || (typeof input.table === "string" && input.table) || "";
  return target ? `${action}: ${target}` : action;
}

interface DatatableAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onSchemaChanged: () => void;
  onModelChange: (providerId: string, model: string) => void;
}

export function DatatableAgentPanel({ providerId, model, streamUrl, onSchemaChanged, onModelChange }: DatatableAgentPanelProps) {
  return (
    <AgentPanel
      title="Nonla Datatable Assistant"
      emptyState="Create tables, add columns, or query and mutate rows."
      placeholder="Describe schema or row changes…"
      providerId={providerId}
      model={model}
      streamUrl={streamUrl}
      onModelChange={onModelChange}
      summarizeToolCall={summarizeDatatableToolCall}
      onToolAction={(event) => {
        if (event.type !== "tool-result" || event.toolName !== "datatable") return;
        const output = event.output;
        let parsed: { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown } | null = null;
        if (typeof output === "string") {
          try {
            parsed = JSON.parse(output) as { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown };
          } catch {
            return;
          }
        } else if (output && typeof output === "object") {
          parsed = output as { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown };
        }
        if (!parsed?.ok) return;
        if (parsed.table || parsed.column || parsed.deleted) onSchemaChanged();
      }}
      resize
    />
  );
}
