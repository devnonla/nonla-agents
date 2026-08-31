import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { useEffect, useRef, useState } from "react";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { AgentPanelComposer } from "src/components/chat/_components/AgentPanelComposer";
import { AgentPanelEmptyState } from "src/components/chat/_components/AgentPanelEmptyState";
import { AgentPanelHeader } from "src/components/chat/_components/AgentPanelHeader";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { siteTurnSummaryHint, summarizeSiteToolCall } from "../common/compactSiteHistory";

export type { ToolActionEvent };

const PANEL_DEFAULT = 360;
const PANEL_MIN = 320;
const PANEL_MAX = 560;

export type SiteSelectionContext = {
  label: string;
  detail: string;
};

interface SiteAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  selectionContext?: SiteSelectionContext | null;
  onClearSelection?: () => void;
  onResizeDraggingChange?: (dragging: boolean) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function SiteAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange, selectionContext = null, onClearSelection, onResizeDraggingChange, onGeneratingChange, onBeforeSend }: SiteAgentPanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const { messages, generating, send, cancel, clear } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall: summarizeSiteToolCall,
    turnSummaryHint: siteTurnSummaryHint,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  useEffect(() => {
    onResizeDraggingChange?.(isDragging);
  }, [isDragging, onResizeDraggingChange]);

  useEffect(() => {
    if (!isDragging) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging]);

  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.startX - e.clientX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endDrag();
  };

  const sendMessage = (text: string) => {
    if (!providerId || !model || generating) return;
    scrollToBottom({ force: true });
    const selectionDetail = selectionContext?.detail;
    onClearSelection?.();
    void (async () => {
      await onBeforeSend?.();
      void send(text, { providerId, model, extraContext: selectionDetail });
    })();
  };

  return (
    <div className="flex h-[45vh] min-h-72 shrink-0 border-t border-border md:h-full md:min-h-0 md:border-t-0">
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onLostPointerCapture={endDrag}
        className={["hidden h-full w-px shrink-0 touch-none md:block md:cursor-col-resize z-10 transition-colors duration-150", isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40"].join(" ")}
      />

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e] md:flex-none" style={{ width, maxWidth: "100%" }}>
        <AgentPanelHeader title="Nonla Site Developer" onNewChat={clear} />

        <AgentPanelComposer
          accessory={
            selectionContext ? (
              <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-accent/30">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Selected</span>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={selectionContext.label}>
                  {selectionContext.label}
                </span>
                <button type="button" onClick={onClearSelection} className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Clear selection">
                  <CloseCircleIcon size={14} />
                </button>
              </div>
            ) : undefined
          }
          input={<InputArea generating={generating} placeholder="Describe what to change…" onSend={sendMessage} onCancel={cancel} providerId={providerId} model={model} onModelChange={onModelChange} enableTypeToFocus={false} />}
          messages={
            <MessageList
              messages={messages}
              generating={generating}
              activityStatus={(() => {
                const last = messages[messages.length - 1];
                if (last?.role === "tool-call" && last.toolOutput) return "Thinking";
                if (last?.role === "tool-call") return "Running tool";
                return "Working";
              })()}
              assistantLabel="Nonla Site Developer"
              emptyStateContent={<AgentPanelEmptyState>Describe a layout, copy, or wiring change. Drafts stay unpublished until you approve.</AgentPanelEmptyState>}
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
