/**
 * CodingAgentPanel.tsx
 *
 * Self-contained AI coding assistant panel.
 * Streaming lives in useAssistantStreaming — no Redux dependency.
 */

import { useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { AgentPanelComposer } from "src/components/chat/_components/AgentPanelComposer";
import { AgentPanelEmptyState } from "src/components/chat/_components/AgentPanelEmptyState";
import { AgentPanelHeader } from "src/components/chat/_components/AgentPanelHeader";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { summarizeCodingToolCall } from "../../common/compactGenerateCodeHistory";

export type { ToolActionEvent };

const PANEL_DEFAULT = 380;
const PANEL_MIN = 280;
const PANEL_MAX = 560;

interface CodingAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  assistantLabel?: string;
}

export function CodingAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange, assistantLabel = "Nonla Developer" }: CodingAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel, clear } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall: summarizeCodingToolCall,
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
      <div onMouseDown={startDrag} className={["w-px shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150", isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40"].join(" ")} />

      <div className="flex flex-col h-full min-h-0 border-l border-border bg-[#1e1e1e] overflow-hidden" style={{ width }}>
        <AgentPanelHeader title={assistantLabel} onNewChat={clear} />

        <AgentPanelComposer
          input={
            <InputArea
              generating={generating}
              placeholder="Describe what to change…"
              onSend={(text) => {
                if (!providerId || !model) return;
                scrollToBottom({ force: true });
                void send(text, { providerId, model });
              }}
              onCancel={cancel}
              providerId={providerId}
              model={model}
              onModelChange={onModelChange}
              focusSignal={providerId && model ? streamUrl : undefined}
              enableTypeToFocus={false}
            />
          }
          messages={
            <MessageList
              messages={messages}
              generating={generating}
              assistantLabel={assistantLabel}
              emptyStateContent={<AgentPanelEmptyState>Describe a rewrite, fix, or new capability. Changes land as a draft you can accept.</AgentPanelEmptyState>}
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
