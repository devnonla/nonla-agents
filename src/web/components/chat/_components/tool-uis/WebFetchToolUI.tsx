import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type FetchInput = {
  url?: string;
  actions?: { action?: string; url?: string }[];
};

type FetchOutput = {
  ok?: boolean;
  url?: string;
  text?: string;
  error?: string;
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as T;
  } catch {
    /* ignore */
  }
  return null;
}

function inputUrl(input: unknown): string {
  const rec = parseJson<FetchInput>(input);
  if (rec?.url) return rec.url;
  const nav = rec?.actions?.find((a) => a.action === "navigate" && a.url);
  return nav?.url || "";
}

export function WebFetchToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const output = parseJson<FetchOutput>(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const url = output?.url || inputUrl(msg.toolInput) || "—";
  const callerColor = assistantColor ?? "var(--primary)";
  const body = failed ? (output?.error ?? msg.toolError ?? "Tool execution failed") : output?.text?.trim() || "";
  const verb = running || failed ? "Fetch page" : "Fetched page";

  return (
    <div className="mt-1 animate-fadeIn">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <details className="group/webfetch px-4 pb-2" style={{ overflowAnchor: "none" }}>
        <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 text-(length:--chat-body-size) leading-5.5 font-normal text-tertiary-foreground select-none [&::-webkit-details-marker]:hidden">
          <RenderIf condition={!running}>
            <GlobalIcon size={13} className={cn("shrink-0", failed ? "text-destructive" : "text-muted-foreground")} />
          </RenderIf>
          <span className={cn("min-w-0 truncate", running && "nonla-chat-shimmer")}>
            {verb} <span className="text-muted-foreground">{url}</span>
          </span>
          <svg className="h-3 w-3 shrink-0 opacity-0 transition-[opacity,transform] duration-150 group-hover/webfetch:opacity-100 group-open/webfetch:opacity-100 group-open/webfetch:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </summary>

        <RenderIf condition={!!body}>
          {() => (
            <pre
              className={cn("m-0 mt-1.5 mb-1 max-h-40 overflow-y-auto rounded-lg border px-3 py-2 font-mono text-[11px] font-normal leading-[1.65] break-all whitespace-pre-wrap", failed ? "border-destructive/35 bg-destructive/6 text-destructive" : "border-(--popper-border) bg-(--nonla-elevated) text-muted-foreground")}
            >
              {body}
            </pre>
          )}
        </RenderIf>
      </details>
    </div>
  );
}
