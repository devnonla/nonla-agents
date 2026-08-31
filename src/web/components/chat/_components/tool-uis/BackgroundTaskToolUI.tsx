import { CheckCircleIcon } from "@solar-icons/react/dynamic/check-circle";
import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { useEffect, useRef, useState } from "react";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import { formatToolName } from "../../common/utils";
import { formatBgElapsed, parseBgTaskRef, useConversationBgTask, useConversationBgTasks } from "../../hooks/useConversationBgTasks";
import { RunningSpinner } from "../RunningSpinner";
import type { ToolUIProps } from "./types";

function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function statusCopy(status: string | undefined): string {
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Stopped";
  if (status === "running") return "Running in the background";
  return "Finished";
}

function FinishedIcon({ status }: { status: string }) {
  if (status === "failed") return <DangerCircleIcon size={13} className="text-muted-foreground" />;
  if (status === "cancelled") return <CloseCircleIcon size={13} className="text-muted-foreground" />;
  return <CheckCircleIcon size={13} className="text-muted-foreground" />;
}

export function BackgroundTaskToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const ref = parseBgTaskRef(msg.toolOutput);
  const convId = useAppSelector((s) => s.chat.activeConversationId);
  const { tasks, loaded, cancellingIds, cancel: cancelTask } = useConversationBgTasks(convId);
  const listed = tasks.find((t) => t.taskId === ref?.taskId);
  const running = listed != null || (!loaded && Boolean(ref));
  const [logsOpen, setLogsOpen] = useState(false);
  const showLogs = running && logsOpen;
  const { task: detail } = useConversationBgTask(convId, showLogs ? (ref?.taskId ?? null) : null, showLogs);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLPreElement>(null);

  const task = listed ?? detail;
  const cancelling = cancellingIds.has(ref?.taskId ?? "");
  const status = running ? "running" : task?.status && task.status !== "expired" ? task.status : "completed";
  const label = formatToolName(task?.toolName ?? ref?.toolName ?? msg.toolLabel ?? msg.toolName ?? "Tool");
  const logs = detail?.console?.trim() ?? "";
  const callerColor = assistantColor ?? "var(--primary)";

  useEffect(() => {
    if (!running) setLogsOpen(false);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!showLogs) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, showLogs]);

  return (
    <div className="mt-1 animate-fadeIn">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <RenderIf condition={!running}>
          <div className="flex min-w-0 items-center gap-2 py-1">
            <FinishedIcon status={status} />
            <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{label}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{statusCopy(status)}</span>
          </div>
        </RenderIf>

        <RenderIf condition={running}>
          <div className="flex gap-0">
            <div className="w-0.5 shrink-0 self-stretch rounded-full bg-brand-soft" />
            <div className="min-w-0 flex-1 pl-2">
              <div className="flex items-center gap-2 py-1">
                <RunningSpinner />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{label}</span>
                <span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-brand-soft">Background</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatBgElapsed(listed?.startedAt && listed.startedAt > 0 ? listed.startedAt : timestampMs(msg.timestamp), now)}</span>
              </div>
              <div className="flex items-center gap-1 pb-1">
                <button type="button" onClick={() => setLogsOpen((v) => !v)} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                  <DocumentTextIcon size={12} />
                  {logsOpen ? "Hide logs" : "Logs"}
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => {
                    if (ref?.taskId) void cancelTask(ref.taskId);
                  }}
                  className="inline-flex h-6 items-center rounded-md border border-border bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                  {cancelling ? "Stopping…" : "Stop"}
                </button>
              </div>
              <RenderIf condition={showLogs}>
                <pre ref={logRef} className="m-0 mt-0.5 max-h-56 overflow-auto rounded-lg border border-border-subtle px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-tertiary-foreground">
                  {logs || "Waiting for output…"}
                </pre>
              </RenderIf>
            </div>
          </div>
        </RenderIf>
      </div>
    </div>
  );
}
