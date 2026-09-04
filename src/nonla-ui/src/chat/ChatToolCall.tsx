import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn";
import { formatToolName, hasMeaningfulInput, prettyJson } from "./utils";

function RunningDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("size-3 shrink-0 rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground animate-spin", className)}
      aria-hidden
    />
  );
}

export type ChatToolCallProps = {
  toolName?: string;
  label?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolError?: boolean | string;
  /** Show running spinner (pending execution). */
  running?: boolean;
  /** Optional icon node (left of label). */
  icon?: ReactNode;
  /** Assistant badge above the card (first tool in a chain). */
  assistantLabel?: string;
  assistantColor?: string;
  showAvatar?: boolean;
  className?: string;
  defaultOpen?: boolean;
};

export function ChatToolCall({
  toolName = "Tool",
  label,
  toolInput,
  toolOutput,
  toolError,
  running = false,
  icon,
  assistantLabel,
  assistantColor = "var(--primary)",
  showAvatar = false,
  className,
  defaultOpen = false,
}: ChatToolCallProps) {
  const hasOutput = toolOutput != null;
  const hasInput = hasMeaningfulInput(toolInput);
  const hasError = Boolean(toolError);
  const isPending = !hasOutput && !hasError;
  const expandable = hasInput || hasOutput || hasError || running;
  const [open, setOpen] = useState(defaultOpen);
  const displayLabel = label ?? formatToolName(toolName);

  const statusIcon = hasError ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-destructive" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ) : (
    icon ?? (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-muted-foreground" aria-hidden>
        <path d="M8 7h8M8 12h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    )
  );

  const header = (
    <>
      <span className="relative size-4 shrink-0">
        <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity", expandable && open ? "opacity-0" : "opacity-100", expandable && "group-hover:opacity-0")}>
          {statusIcon}
        </span>
        {expandable ? (
          <span className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground transition-opacity", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={cn("transition-transform duration-150", open && "rotate-180")}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-left text-[12px] font-medium text-muted-foreground", expandable && "transition-colors group-hover:text-foreground")}>
        {displayLabel}
      </span>
      {running ? <RunningDot /> : null}
    </>
  );

  return (
    <div className={cn("nonla-chat-tool mt-1", className)}>
      {showAvatar && assistantLabel ? (
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: assistantColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      ) : null}
      <div className="px-4 pb-0.5">
        <div className={cn("mb-1 overflow-hidden rounded-lg border", hasError ? "border-destructive/35" : "border-border-subtle")}>
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn("group flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 outline-none transition-colors hover:bg-muted border-0 bg-transparent", open && "bg-muted")}
            >
              {header}
            </button>
          ) : (
            <div className="flex w-full items-center gap-2 px-2.5 py-1.5">{header}</div>
          )}

          {open && expandable ? (
            <div className="border-t border-border-subtle font-mono text-[11px]">
              {hasInput ? (
                <pre className="m-0 max-h-27.5 overflow-y-auto bg-transparent px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground">
                  {prettyJson(toolInput)}
                </pre>
              ) : null}
              {running ? (
                <div className="flex items-center gap-2 border-t border-border-subtle bg-muted/40 px-3 py-2 text-muted-foreground">
                  <RunningDot />
                  <span className="italic">Running…</span>
                </div>
              ) : null}
              {!isPending ? (
                <pre
                  className={cn(
                    "m-0 max-h-75 overflow-y-auto px-3 py-2 break-all whitespace-pre-wrap font-normal leading-[1.65] text-muted-foreground",
                    hasInput && "border-t border-border-subtle",
                    hasError ? "bg-destructive/6" : "bg-muted/40",
                  )}
                >
                  {hasOutput ? prettyJson(toolOutput) : typeof toolError === "string" ? toolError : "Tool execution failed"}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
