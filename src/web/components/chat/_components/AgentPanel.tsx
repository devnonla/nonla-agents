import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SummarizeToolCallFn, ToolActionEvent, TurnSummaryHintFn } from "src/common/hooks/useAssistantStreaming";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { AgentPanelComposer } from "./AgentPanelComposer";
import { AgentPanelEmptyState } from "./AgentPanelEmptyState";
import { AgentPanelHeader } from "./AgentPanelHeader";
import { InputArea } from "./InputArea";
import { MessageList } from "./MessageList";

export type { ToolActionEvent };

const DEFAULT_WIDTH = 380;
const DEFAULT_MIN = 280;
const DEFAULT_MAX = 560;

export type AgentPanelResize = {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onDraggingChange?: (dragging: boolean) => void;
  /** Stack under the editor on small screens (site editor). */
  mobileStack?: boolean;
};

export interface AgentPanelProps {
  title: string;
  emptyState: ReactNode;
  placeholder?: string;
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onModelChange: (providerId: string, model: string) => void;
  onToolAction?: (event: ToolActionEvent) => void;
  summarizeToolCall?: SummarizeToolCallFn;
  turnSummaryHint?: TurnSummaryHintFn;
  labelToolCall?: (toolName: string, input: unknown) => string | null;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
  extraContext?: string;
  onAfterSend?: () => void;
  accessory?: ReactNode;
  /** Right-dock with a drag handle. Omit to fill the parent (prompt page). */
  resize?: boolean | AgentPanelResize;
}

function resolveResize(resize: AgentPanelProps["resize"]): AgentPanelResize | null {
  if (!resize) return null;
  return resize === true ? {} : resize;
}

export function AgentPanel({ title, emptyState, placeholder = "Describe what to change…", providerId, model, streamUrl, onModelChange, onToolAction, summarizeToolCall, turnSummaryHint, labelToolCall, onGeneratingChange, onBeforeSend, extraContext, onAfterSend, accessory, resize }: AgentPanelProps) {
  const resizeCfg = resolveResize(resize);
  const minWidth = resizeCfg?.minWidth ?? DEFAULT_MIN;
  const maxWidth = resizeCfg?.maxWidth ?? DEFAULT_MAX;
  const [width, setWidth] = useState(resizeCfg?.defaultWidth ?? DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });
  const onDraggingChange = resizeCfg?.onDraggingChange;
  const mobileStack = Boolean(resizeCfg?.mobileStack);

  const { messages, generating, send, cancel, clear } = useAssistantStreaming({
    streamUrl,
    onToolAction,
    summarizeToolCall,
    turnSummaryHint,
    labelToolCall,
  });

  const { scrollRef, scrollToBottom } = useAutoScroll();

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);

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
    setWidth(Math.min(maxWidth, Math.max(minWidth, dragRef.current.startW + dx)));
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
    const extra = extraContext?.trim();
    onAfterSend?.();
    void (async () => {
      await onBeforeSend?.();
      void send(text, { providerId, model, extraContext: extra });
    })();
  };

  const body = (
    <>
      <AgentPanelHeader title={title} onNewChat={clear} />
      <AgentPanelComposer
        accessory={accessory}
        input={<InputArea generating={generating} placeholder={placeholder} onSend={sendMessage} onCancel={cancel} providerId={providerId} model={model} onModelChange={onModelChange} focusSignal={providerId && model ? streamUrl : undefined} enableTypeToFocus={false} />}
        messages={<MessageList messages={messages} generating={generating} assistantLabel={title} emptyStateContent={<AgentPanelEmptyState>{emptyState}</AgentPanelEmptyState>} scrollContainerRef={scrollRef} className="selectable" />}
      />
    </>
  );

  if (!resizeCfg) {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">{body}</div>;
  }

  return (
    <div className={mobileStack ? "flex h-[45vh] min-h-72 shrink-0 border-t border-border md:h-full md:min-h-0 md:border-t-0" : "flex h-full min-h-0 shrink-0"}>
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onLostPointerCapture={endDrag}
        className={["h-full w-px shrink-0 touch-none z-10 transition-colors duration-150", mobileStack ? "hidden md:block md:cursor-col-resize" : "cursor-col-resize", isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40"].join(" ")}
      />
      <div className={mobileStack ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background md:flex-none" : "flex h-full min-h-0 flex-col overflow-hidden bg-background"} style={{ width, maxWidth: "100%" }}>
        {body}
      </div>
    </div>
  );
}
