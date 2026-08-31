import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { useState } from "react";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import { prettyJson } from "../../common/utils";
import { RunningSpinner } from "../RunningSpinner";
import type { ToolUIProps } from "./types";

type BrowserAction = {
  action: string;
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  ms?: number;
  direction?: string;
  amount?: number;
};

type BrowserActionResult = {
  index: number;
  action: string;
  ok: boolean;
  error?: string;
};

type BrowserRunResult = {
  ok: boolean;
  url?: string;
  title?: string;
  results?: BrowserActionResult[];
  error?: string;
};

function parseActions(input: unknown): BrowserAction[] {
  if (!input || typeof input !== "object") return [];
  const actions = (input as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter((a): a is BrowserAction => !!a && typeof a === "object" && typeof (a as BrowserAction).action === "string");
}

function parseOutput(raw: string | null | undefined): BrowserRunResult | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && "ok" in parsed) return parsed as BrowserRunResult;
  } catch {
    /* ignore */
  }
  return null;
}

function actionSummary(action: BrowserAction): string {
  switch (action.action) {
    case "navigate":
      return action.url ?? "";
    case "click":
    case "fill":
    case "type":
    case "select":
      return action.selector ?? action.value ?? action.text ?? "";
    case "wait":
      if (action.selector) return action.selector;
      if (action.ms != null) return `${action.ms}ms`;
      return "";
    case "press":
      return action.key ?? "";
    case "scroll":
      return [action.direction, action.amount != null ? `${action.amount}px` : null, action.selector].filter(Boolean).join(" ");
    default:
      return action.selector ?? action.url ?? "";
  }
}

function firstUrl(actions: BrowserAction[], output: BrowserRunResult | null): string {
  const nav = actions.find((a) => a.action === "navigate" && a.url);
  return output?.url || nav?.url || "about:blank";
}

export function BrowserToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const [open, setOpen] = useState(false);
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const actions = parseActions(msg.toolInput);
  const output = parseOutput(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const url = firstUrl(actions, output);
  const callerColor = assistantColor ?? "var(--primary)";

  return (
    <div className="animate-fadeIn mt-1">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent py-1 text-left outline-none">
            <span className="relative size-4 shrink-0">
              <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity", open ? "opacity-0" : "opacity-100 group-hover:opacity-0")}>
                {failed ? <DangerCircleIcon size={13} className="text-destructive" /> : running ? <RunningSpinner /> : <GlobalIcon size={13} className="text-muted-foreground" />}
              </span>
              <span className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground transition-opacity", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                <AltArrowDownIcon size={12} className={cn("transition-transform duration-150", open && "rotate-180")} />
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary-foreground">{url}</span>
          </button>

          <RenderIf condition={open}>
            <div className="mt-0.5 overflow-hidden rounded-lg border border-border-subtle py-2">
              <div className="relative flex flex-col px-3">
                {actions.map((action, i) => {
                  const result = output?.results?.find((r) => r.index === i);
                  const summary = actionSummary(action);
                  const isLast = i === actions.length - 1;
                  const stepFailed = result?.ok === false;
                  const stepOk = result?.ok === true;
                  const stepPending = result == null && running && i === 0;

                  return (
                    <div key={`${action.action}-${i}`} className="relative flex min-w-0 gap-2.5">
                      <div className="relative flex w-3 shrink-0 justify-center self-stretch">
                        <RenderIf condition={!isLast}>
                          <span className="absolute top-2.5 bottom-0 w-px bg-border" />
                        </RenderIf>
                        <span className={cn("relative z-10 mt-1 size-1.5 shrink-0 rounded-full ring-2 ring-popover", stepFailed && "bg-muted-foreground", stepOk && "bg-muted-foreground/70", stepPending && "bg-muted-foreground animate-pulse", !stepFailed && !stepOk && !stepPending && "bg-muted-foreground/30")} />
                      </div>
                      <div className={cn("min-w-0 flex-1 pb-2.5", isLast && "pb-0")}>
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="shrink-0 text-[11px] text-foreground">{action.action}</span>
                          <RenderIf condition={!!summary}>{() => <span className="truncate text-[11px] text-tertiary-foreground">{summary}</span>}</RenderIf>
                        </div>
                        <RenderIf condition={!!result?.error}>{() => <p className="m-0 mt-0.5 truncate text-[10px] text-destructive">{result?.error}</p>}</RenderIf>
                      </div>
                    </div>
                  );
                })}
              </div>

              <RenderIf condition={!!output?.error || hasError}>
                <p className="m-0 mt-1.5 px-3 text-[11px] text-destructive">{output?.error ?? "Tool execution failed"}</p>
              </RenderIf>
              <RenderIf condition={hasOutput}>
                <pre className="m-0 mt-1.5 max-h-40 overflow-y-auto px-3 font-mono text-[10px] leading-normal break-all whitespace-pre-wrap text-tertiary-foreground">{prettyJson(msg.toolOutput)}</pre>
              </RenderIf>
            </div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}
