import { ChatRoundIcon } from "@solar-icons/react/dynamic/chat-round";
import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { UserAvatar } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import { parseCallAgentToolTargetId, prettyJson } from "../../common/utils";
import { formatBgElapsed, parseBgTaskRef, useConversationBgTask, useConversationBgTasks } from "../../hooks/useConversationBgTasks";
import { RunningSpinner } from "../RunningSpinner";
import { markdownComponents, markdownRootClass } from "../markdown";
import type { ToolUIProps } from "./types";

type CallAgentParsed = {
  success: boolean;
  response: string | null;
  agentId: string | null;
  error: string | null;
};

function parseCallAgentOutput(raw: unknown): CallAgentParsed | null {
  if (raw == null) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
      const rec = parsed as { success?: unknown; response?: string | null; agent_id?: string | null; error?: string | null };
      return {
        success: Boolean(rec.success),
        response: rec.response ?? null,
        agentId: rec.agent_id ?? null,
        error: rec.error ?? null,
      };
    }
  } catch {}
  return null;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-0.5 py-0.5" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

function AgentTurn({
  name,
  avatar,
  avatarSeed,
  children,
  align = "start",
}: {
  name: string;
  avatar?: string | null;
  avatarSeed: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("flex items-start gap-2.5", align === "end" && "flex-row-reverse")}>
      <UserAvatar avatar={avatar} name={avatar ? name : avatarSeed} size={24} className="mt-0.5 shrink-0 ring-1 ring-border" />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", align === "end" ? "items-end" : "items-start")}>
        <span className="select-none text-[11px] font-medium text-muted-foreground">{name}</span>
        <div className="w-fit max-w-[92%]">{children}</div>
      </div>
    </div>
  );
}

function ExpandableBody({ children, className }: { children: ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > 160);
  }, [children]);

  return (
    <div>
      <div ref={bodyRef} className={cn("overflow-hidden transition-[max-height] duration-200", !expanded && "max-h-40", className)}>
        {children}
      </div>
      <RenderIf condition={overflows}>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[11px] text-muted-foreground hover:text-foreground">
          {expanded ? "Show less" : "Show more"}
        </button>
      </RenderIf>
    </div>
  );
}

function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export function CallAgentToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const bgRef = parseBgTaskRef(msg.toolOutput);
  const convId = useAppSelector((s) => s.chat.activeConversationId);
  const agents = useAppSelector((s) => s.agents.items) as Agent[];
  const { tasks, loaded, cancellingIds, cancel: cancelTask } = useConversationBgTasks(convId);
  const listed = bgRef ? tasks.find((t) => t.taskId === bgRef.taskId) : undefined;
  const { task: detail } = useConversationBgTask(convId, bgRef?.taskId ?? null, Boolean(bgRef));
  const bgTask = listed ?? detail;

  let calledAgentId: string | undefined;
  calledAgentId = (msg.toolInput as Record<string, unknown> | null)?.agent_id as string | undefined;
  if (!calledAgentId && msg.toolName) {
    calledAgentId = parseCallAgentToolTargetId(msg.toolName) ?? undefined;
  }
  if (!calledAgentId && msg.toolOutput) {
    try {
      const rec = JSON.parse(msg.toolOutput) as { agent_id?: string };
      calledAgentId = rec?.agent_id;
    } catch {
      /* ignore */
    }
  }

  const parsed = parseCallAgentOutput(msg.toolOutput) ?? parseCallAgentOutput(bgTask?.result) ?? (bgTask?.status === "failed" || bgTask?.status === "cancelled" ? { success: false, response: null, agentId: calledAgentId ?? null, error: bgTask.error ?? "Cancelled" } : null);
  const failed = hasError || parsed?.success === false || bgTask?.status === "failed" || bgTask?.status === "cancelled";
  const bgRunning = Boolean(bgRef) && !failed && !parsed && (listed != null || bgTask?.status === "running" || bgTask == null || (!loaded && !detail));
  const cancelling = cancellingIds.has(bgRef?.taskId ?? "");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!bgRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bgRunning]);

  const calledAgent = calledAgentId ? agents.find((a) => a.id === calledAgentId) : undefined;
  const callerAgent = agents.find((a) => a.name === assistantLabel);
  const requestMessage = ((msg.toolInput as Record<string, unknown> | null)?.message as string | undefined)?.trim() ?? "";
  const hasRequest = requestMessage.length > 0;
  const composing = !hasOutput && !hasError && !hasRequest;
  const awaitingReply = bgRunning || (!hasOutput && !hasError && hasRequest);
  const showCallee = awaitingReply || failed || parsed != null;

  const callerName = assistantLabel;
  const calleeName = calledAgent?.name ?? msg.toolLabel?.replace(/^Call\s+/i, "") ?? "Agent";
  const callerSeed = `caller:${callerName}`;
  const calleeSeed = calledAgentId ? `agent:${calledAgentId}` : `agent:${calleeName}`;
  const callerColor = assistantColor ?? "var(--primary)";

  const statusLabel = failed && !awaitingReply ? (parsed?.error ?? "Call failed") : null;

  return (
    <div className="mt-1 animate-fadeIn">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 py-1">
        <div className={cn("overflow-hidden rounded-xl border", failed ? "border-destructive/35 bg-destructive/4" : "border-border bg-muted/20")}>
          <div className={cn("flex items-center gap-2 px-3 py-2", (composing || hasRequest || hasOutput || hasError) && (failed ? "border-b border-destructive/20" : "border-b border-border-subtle"))}>
            <ChatRoundIcon size={13} className={cn("shrink-0", failed ? "text-destructive" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">Calling {calleeName}</span>
            <RenderIf condition={bgRunning}>
              {() => (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{formatBgElapsed(listed?.startedAt && listed.startedAt > 0 ? listed.startedAt : timestampMs(msg.timestamp), now)}</span>
                  <button
                    type="button"
                    disabled={cancelling || !bgRef?.taskId}
                    onClick={() => {
                      if (bgRef?.taskId) void cancelTask(bgRef.taskId);
                    }}
                    className="inline-flex h-6 items-center rounded-md border border-border bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                  >
                    {cancelling ? "Stopping…" : "Stop"}
                  </button>
                </span>
              )}
            </RenderIf>
            <RenderIf condition={!bgRunning && !!statusLabel}>{() => <span className={cn("max-w-40 truncate text-[11px] italic", failed ? "text-destructive" : "text-muted-foreground")}>{statusLabel}</span>}</RenderIf>
          </div>

          <RenderIf condition={composing || hasRequest || showCallee}>
            <div className="flex flex-col gap-3 px-3 py-3">
              <RenderIf condition={composing || hasRequest}>
                <AgentTurn name={callerName} avatar={callerAgent?.avatar} avatarSeed={callerSeed} align="end">
                  <div className="rounded-2xl rounded-tr-sm border border-primary/15 bg-primary/10 px-3 py-2 text-left">
                    <RenderIf condition={composing}>
                      <TypingDots />
                    </RenderIf>
                    <RenderIf condition={hasRequest}>
                      <p className="m-0 text-[12px] leading-[1.55] whitespace-pre-wrap text-foreground">{requestMessage}</p>
                    </RenderIf>
                  </div>
                </AgentTurn>
              </RenderIf>

              <RenderIf condition={showCallee}>
                <AgentTurn name={calleeName} avatar={calledAgent?.avatar} avatarSeed={calleeSeed} align="start">
                  <div className="w-fit rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-3 py-2 text-left">
                    <RenderIf condition={awaitingReply}>
                      <div className="flex items-center gap-1.5 py-0.5">
                        <RunningSpinner />
                        <span className="text-[11px] italic text-muted-foreground">Replying…</span>
                      </div>
                    </RenderIf>

                    <RenderIf condition={!awaitingReply && failed}>
                      <p className="m-0 text-[12px] leading-[1.55] text-destructive">{parsed?.error ?? "Agent call failed"}</p>
                    </RenderIf>

                    <RenderIf condition={!awaitingReply && !failed && !!parsed}>
                      {() => (
                        <ExpandableBody>
                          <div className={cn(markdownRootClass, "text-[12px] leading-[1.55] text-foreground [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:text-[12px] [&_li]:text-[12px] [&_td]:text-[11px] [&_th]:text-[11px] [&_code]:text-[11px] [&_p]:m-0 [&_p]:mb-0 [&_p+p]:mt-2")}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {parsed?.response ?? "(no response)"}
                            </ReactMarkdown>
                          </div>
                        </ExpandableBody>
                      )}
                    </RenderIf>

                    <RenderIf condition={!awaitingReply && !failed && !parsed}>
                      <ExpandableBody>
                        <pre className="m-0 font-mono text-[11px] leading-normal break-all whitespace-pre-wrap text-muted-foreground">{prettyJson(msg.toolOutput)}</pre>
                      </ExpandableBody>
                    </RenderIf>
                  </div>
                </AgentTurn>
              </RenderIf>
            </div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}
