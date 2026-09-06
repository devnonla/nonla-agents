import { ChatSpinner } from "@nonla-agents/ui";
import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { useState } from "react";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { ToolIcon } from "src/modules/tools/components/ToolIcon";
import { useAppSelector } from "src/store/store";
import type { ChatAgentMessage } from "../common/types";
import { formatToolName, prettyJson } from "../common/utils";
import { parseBgTaskRef } from "../hooks/useConversationBgTasks";
import { resolveToolUI } from "./tool-uis";
import { BackgroundTaskToolUI } from "./tool-uis/BackgroundTaskToolUI";

function hasMeaningfulInput(input: unknown): boolean {
  if (input == null) return false;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]";
  }
  if (Array.isArray(input)) return input.length > 0;
  if (typeof input === "object") return Object.keys(input as object).length > 0;
  return true;
}

function ToolStatusIcon({
  hasError,
  open,
  toolIcon,
  interactive,
}: {
  hasError: boolean;
  open: boolean;
  toolIcon?: string | null;
  interactive: boolean;
}) {
  const icon = hasError ? <DangerCircleIcon size={13} className="text-destructive" /> : <ToolIcon icon={toolIcon} size={13} className="text-muted-foreground" fallback={<ProgrammingIcon size={13} className="text-muted-foreground" />} />;

  if (!interactive) {
    return <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>;
  }

  return (
    <span className="relative size-4 shrink-0">
      <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity", open ? "opacity-0" : "opacity-100 group-hover:opacity-0")}>{icon}</span>
      <span className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground transition-opacity", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <AltArrowDownIcon size={12} className={cn("transition-transform duration-150", open && "rotate-180")} />
      </span>
    </span>
  );
}

function ToolCallCard({ msg }: { msg: ChatAgentMessage }) {
  const hasOutput = msg.toolOutput != null;
  const hasInput = hasMeaningfulInput(msg.toolInput);
  const hasError = Boolean(msg.toolError);
  const isPending = !hasOutput && !hasError;
  const [open, setOpen] = useState(false);
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const tools = useAppSelector((s) => s.tools.items) as { name: string; icon?: string | null }[];
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = isPending && !!isConvRunning;
  const expandable = hasInput || hasOutput || hasError || running;

  const label = msg.toolLabel ?? formatToolName(msg.toolName ?? "Tool");
  const toolIcon = msg.toolIcon ?? tools.find((t) => t.name === msg.toolName)?.icon ?? null;

  const header = (
    <>
      <ToolStatusIcon hasError={hasError} open={open} toolIcon={toolIcon} interactive={expandable} />
      <span className={cn("min-w-0 flex-1 truncate text-left text-[12px] font-medium text-muted-foreground", expandable && "transition-colors group-hover:text-foreground")}>{label}</span>
      <RenderIf condition={running}>
        <ChatSpinner />
      </RenderIf>
    </>
  );

  return (
    <div className={cn("mb-1 overflow-hidden rounded-lg border", hasError ? "border-destructive/35" : "border-border-subtle")}>
      {expandable ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className={cn("group flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 outline-none transition-colors hover:bg-muted", open && "bg-muted")}>
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 px-2.5 py-1.5">{header}</div>
      )}

      <RenderIf condition={open && expandable}>
        <div className="border-t border-border-subtle font-mono text-[11px]">
          <RenderIf condition={hasInput}>
            <pre className="m-0 max-h-27.5 overflow-y-auto bg-transparent px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground">{prettyJson(msg.toolInput)}</pre>
          </RenderIf>
          <RenderIf condition={running}>
            <div className="flex items-center gap-2 border-t border-border-subtle bg-muted/40 px-3 py-2 text-muted-foreground">
              <ChatSpinner />
              <span className="italic">Running…</span>
            </div>
          </RenderIf>
          <RenderIf condition={!isPending}>
            <pre className={cn("m-0 max-h-75 overflow-y-auto px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground", hasInput && "border-t border-border-subtle", hasError ? "bg-destructive/6" : "bg-muted/40")}>{hasOutput ? prettyJson(msg.toolOutput) : "Tool execution failed"}</pre>
          </RenderIf>
        </div>
      </RenderIf>
    </div>
  );
}

export function ToolCallGroup({
  messages,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: {
  messages: ChatAgentMessage[];
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="mt-1 animate-fadeIn">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: color, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      )}
      <div className="px-4 pb-0.5">
        <div className="flex flex-col">
          {messages.map((m) => (
            <ToolCallCard key={m.id} msg={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ToolCallBubble({
  msg,
  assistantLabel = "Assistant",
  assistantColor,
  showAvatar = true,
}: {
  msg: ChatAgentMessage;
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
}) {
  const CustomUI = resolveToolUI(msg.toolName);
  if (CustomUI) {
    return <CustomUI msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }
  if (parseBgTaskRef(msg.toolOutput)) {
    return <BackgroundTaskToolUI msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }

  const color = assistantColor ?? "var(--primary)";
  return (
    <div className="mt-1 animate-fadeIn">
      {showAvatar && (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: color, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      )}
      <div className="px-4 pb-0.5">
        <ToolCallCard msg={msg} />
      </div>
    </div>
  );
}
