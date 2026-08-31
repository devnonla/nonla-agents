import { useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { AgentPanelComposer } from "src/components/chat/_components/AgentPanelComposer";
import { AgentPanelEmptyState } from "src/components/chat/_components/AgentPanelEmptyState";
import { AgentPanelHeader } from "src/components/chat/_components/AgentPanelHeader";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

export type { ToolActionEvent };

const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

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
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel, clear } = useAssistantStreaming({
    streamUrl,
    summarizeToolCall: summarizeDatatableToolCall,
    onToolAction: (event) => {
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
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  const handleDragMouseMove = (e: MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.startX - e.clientX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const handleDragMouseUp = () => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleDragMouseMove);
      document.removeEventListener("mouseup", handleDragMouseUp);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);
  };

  return (
    <div className="flex h-full min-h-0 shrink-0">
      <div onMouseDown={startDrag} className={["z-10 h-full w-px shrink-0 cursor-col-resize transition-colors duration-150", isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40"].join(" ")} />

      <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-[#1e1e1e]" style={{ width }}>
        <AgentPanelHeader title="Nonla Datatable Assistant" onNewChat={clear} />

        <AgentPanelComposer
          input={
            <InputArea
              generating={generating}
              placeholder="Describe schema or row changes…"
              onSend={(text) => {
                if (!providerId || !model) return;
                scrollToBottom({ force: true });
                void send(text, { providerId, model });
              }}
              onCancel={cancel}
              providerId={providerId}
              model={model}
              onModelChange={onModelChange}
              enableTypeToFocus={false}
            />
          }
          messages={
            <MessageList
              messages={messages}
              generating={generating}
              assistantLabel="Nonla Datatable Assistant"
              emptyStateContent={<AgentPanelEmptyState>Create tables, add columns, or query and mutate rows.</AgentPanelEmptyState>}
              messagesEndRef={messagesEndRef}
              scrollContainerRef={scrollContainerRef}
              className="selectable"
            />
          }
        />
      </div>
    </div>
  );
}
