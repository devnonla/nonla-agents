import { ChatSpinner } from "@nonla-agents/ui";
import { ClockCircleIcon } from "@solar-icons/react/dynamic/clock-circle";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type TimeResult = {
  time?: string;
  timezone?: string;
  iso?: string;
};

function parseOutput(raw: string | null | undefined): TimeResult | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") return parsed as TimeResult;
  } catch {
    /* ignore */
  }
  return null;
}

function formatLabel(iso: string | undefined, timezone: string | undefined, fallback: string | undefined): string {
  if (iso) {
    try {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        const tz = timezone || "UTC";
        const clock = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        const date = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
        return `${clock} · ${date} · ${tz}`;
      }
    } catch {
      /* fall through */
    }
  }
  if (fallback && timezone) return `${fallback} · ${timezone}`;
  return fallback ?? timezone ?? "—";
}

export function GetCurrentTimeToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const output = parseOutput(msg.toolOutput);
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const callerColor = assistantColor ?? "var(--primary)";
  const label = formatLabel(output?.iso, output?.timezone, output?.time);

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
        <div className="flex items-center gap-2 py-1">
          {hasError ? <DangerCircleIcon size={13} className="text-destructive shrink-0" /> : running ? <ChatSpinner /> : <ClockCircleIcon size={13} className="text-muted-foreground shrink-0" />}
          <span className="text-[12px] font-medium text-muted-foreground truncate tabular-nums">{hasError ? "Failed to get time" : running ? "Getting time…" : label}</span>
        </div>
      </div>
    </div>
  );
}
