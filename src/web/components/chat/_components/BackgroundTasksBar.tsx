import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { AltArrowRightIcon } from "@solar-icons/react/dynamic/alt-arrow-right";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { Modal, Popconfirm } from "antd";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import RenderIf from "src/components/RenderIf";
import { formatToolName } from "../common/utils";
import { type ConversationBgTask, formatBgElapsed, useConversationBgTask, useConversationBgTasks } from "../hooks/useConversationBgTasks";
import { RunningSpinner } from "./RunningSpinner";

function TaskLogsModal({
  conversationId,
  task,
  open,
  onClose,
}: {
  conversationId: string | null;
  task: ConversationBgTask | null;
  open: boolean;
  onClose: () => void;
}) {
  const { task: live } = useConversationBgTask(conversationId, open && task ? task.taskId : null, open);
  const logs = (live?.console ?? task?.console ?? "").trim();
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={task ? formatToolName(task.toolName) : "Logs"} width={560}>
      <pre ref={preRef} className="m-0 max-h-[50vh] overflow-auto rounded-md border border-border-subtle bg-black/25 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-tertiary-foreground">
        {logs || "Waiting for output…"}
      </pre>
    </Modal>
  );
}

function TaskRow({
  task,
  now,
  cancelling,
  onCancel,
  onLogs,
}: {
  task: ConversationBgTask;
  now: number;
  cancelling: boolean;
  onCancel: () => void;
  onLogs: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1">
      <RunningSpinner className="size-2.5" />
      <div className="min-w-0 flex-1 truncate text-[11px] text-foreground">{formatToolName(task.toolName)}</div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatBgElapsed(task.startedAt, now)}</span>
      <button type="button" onClick={onLogs} title="Logs" aria-label={`Logs ${formatToolName(task.toolName)}`} className="inline-flex size-5 shrink-0 items-center justify-center cursor-pointer rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <DocumentTextIcon size={12} />
      </button>
      <Popconfirm title={`Stop ${formatToolName(task.toolName)}?`} okText="Stop" okType="danger" onConfirm={onCancel} getPopupContainer={() => document.body}>
        <button type="button" disabled={cancelling} title="Stop" aria-label={`Stop ${formatToolName(task.toolName)}`} className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] cursor-pointer text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-40">
          Stop
        </button>
      </Popconfirm>
    </div>
  );
}

export function BackgroundTasksBar({ conversationId, children }: { conversationId: string | null; children: ReactNode }) {
  const { tasks, cancellingIds, cancel } = useConversationBgTasks(conversationId);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [logsTask, setLogsTask] = useState<ConversationBgTask | null>(null);

  useEffect(() => {
    if (logsTask && !tasks.some((t) => t.taskId === logsTask.taskId)) {
      setLogsTask(null);
    }
  }, [tasks, logsTask]);

  useEffect(() => {
    if (tasks.length === 0) {
      setOpen(false);
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tasks.length]);

  const listInnerRef = useRef<HTMLDivElement>(null);
  const [listH, setListH] = useState(0);

  useLayoutEffect(() => {
    const el = listInnerRef.current;
    if (!el) {
      setListH(0);
      return;
    }
    const update = () => setListH(el.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tasks.length, open]);

  const label = tasks.length === 1 ? "1 background task" : `${tasks.length} background tasks`;
  const reserve = tasks.length > 0 ? 28 + (open ? listH : 0) : 0;

  return (
    <>
      <div className="pointer-events-none shrink-0 overflow-hidden transition-[height] duration-200 ease-out" style={{ height: reserve }} aria-hidden />
      <div className="relative">
        {children}

        <RenderIf condition={tasks.length > 0}>
          <div className="absolute right-5 bottom-[calc(100%)] left-5 z-20 overflow-hidden rounded-t-lg border-x border-t border-border">
            <div className={cn("flex h-7.5 items-center gap-1 px-1", open && "border-b border-border-subtle")}>
              <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 font-medium items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground/90 transition-colors hover:text-foreground" aria-expanded={open} aria-label={label}>
                {open ? <AltArrowDownIcon size={12} /> : <AltArrowRightIcon size={12} />}
                <span className="truncate">{label}</span>
              </button>
            </div>

            <div className={cn("overflow-hidden transition-[max-height] duration-200 ease-out", open ? "max-h-55" : "max-h-0")}>
              <div ref={listInnerRef} className="max-h-55 overflow-y-auto py-0.5">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.taskId}
                    task={task}
                    now={now}
                    cancelling={cancellingIds.has(task.taskId)}
                    onCancel={() => {
                      void cancel(task.taskId);
                    }}
                    onLogs={() => setLogsTask(task)}
                  />
                ))}
              </div>
            </div>
          </div>
        </RenderIf>
      </div>

      <TaskLogsModal conversationId={conversationId} task={logsTask} open={Boolean(logsTask)} onClose={() => setLogsTask(null)} />
    </>
  );
}
