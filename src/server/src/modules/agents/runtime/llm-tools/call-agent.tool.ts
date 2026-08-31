/**
 * call-agent.tool.ts — Builtin: one LangChain tool per callable sub-agent.
 *
 * NOTE: generateAgent is imported lazily to avoid circular dependency:
 *   agentRunner → resolveTools → call-agent → agentRunner
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents, getDb } from "../../../../common/db/client.js";
import { bgTaskRegistry } from "../../../tools/common/bg-task-registry.js";

export const CALL_AGENT_TOOL_PREFIX = "call_agent__";

/** Soft-wait before detaching into bgTaskRegistry — same window as custom tools. */
export const CALL_AGENT_SOFT_WAIT_MS = 120_000;

export function callAgentToolName(agentId: string): string {
  return `${CALL_AGENT_TOOL_PREFIX}${agentId.replace(/-/g, "_")}`;
}

export function isCallAgentToolName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name === "call_agent" || name.startsWith(CALL_AGENT_TOOL_PREFIX);
}

export function parseCallAgentToolTargetId(toolName: string): string | null {
  if (toolName === "call_agent") return null;
  if (!toolName.startsWith(CALL_AGENT_TOOL_PREFIX)) return null;
  const raw = toolName.slice(CALL_AGENT_TOOL_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length !== 5) return null;
  return parts.join("-");
}

export type CallAgentTarget = {
  id: string;
  name: string;
  description: string | null;
};

export type CallAgentOutcome = {
  success: boolean;
  agent_id: string;
  response: string | null;
  error: string | null;
};

export type MakeCallAgentToolsOptions = {
  callerAgentId: string;
  targets: CallAgentTarget[];
  ownerId: string;
  isGuest?: boolean;
  abortSignal?: AbortSignal;
  conversationId?: string | null;
  enableMemory?: boolean;
};

function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (err instanceof Error && err.name === "AbortError") || msg.includes("AbortError") || Boolean(abortSignal?.aborted);
}

/**
 * Race a nested agent run against soft-wait. Completes in-window → JSON outcome.
 * Exceeds → register bg task (no wall-clock kill) and return `{ status: "running", taskId }`.
 */
export async function settleCallAgentWork(opts: {
  work: Promise<CallAgentOutcome>;
  abort: AbortController;
  softWaitMs: number;
  toolId: string;
  toolName: string;
  targetId: string;
  agentId?: string;
  conversationId?: string | null;
}): Promise<string> {
  const softTimer = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), Math.max(0, opts.softWaitMs));
  });

  const raced = await Promise.race([opts.work.then((r) => ({ kind: "done" as const, r })), softTimer.then(() => ({ kind: "timeout" as const }))]);

  if (raced.kind === "done") {
    return JSON.stringify(raced.r);
  }

  const taskId = bgTaskRegistry.register({
    toolId: opts.toolId,
    toolName: opts.toolName,
    agentId: opts.agentId,
    conversationId: opts.conversationId,
    kill: () => opts.abort.abort(),
  });

  void opts.work.then((r) => {
    if (r.success) bgTaskRegistry.finish(taskId, { ok: true, result: r });
    else bgTaskRegistry.finish(taskId, { ok: false, error: r.error ?? "call_agent failed" });
  });

  return JSON.stringify({
    status: "running",
    taskId,
    toolName: opts.toolName,
    agent_id: opts.targetId,
    message: "Still running in the background. Use background_tasks (await/get/list/cancel) with this taskId.",
  });
}

async function invokeSubAgent(opts: {
  callerAgentId: string;
  targetId: string;
  message: string;
  context?: string;
  ownerId: string;
  isGuest: boolean;
  abortSignal: AbortSignal;
  conversationId?: string | null;
  enableMemory?: boolean;
}): Promise<CallAgentOutcome> {
  const baseMessage = opts.context ? `${opts.message}\n\n---\n**Additional context:**\n${opts.context}` : opts.message;

  let callerName = "Another agent";
  try {
    const db = getDb();
    const caller = db.select({ name: agents.name }).from(agents).where(eq(agents.id, opts.callerAgentId)).get();
    if (caller?.name) callerName = caller.name;
  } catch {
    /* ignore */
  }

  const fullMessage = `<caller_context>
This request comes from agent "${callerName}" (not a human user).
You are being called as a sub-agent to handle a specific task.

Rules for your response:
- Be concise and information-dense. No filler, no pleasantries.
- Provide complete, actionable information in your response.
- Do NOT ask follow-up questions — you will not get a reply.
- Focus solely on executing the task and returning the result.
</caller_context>

${baseMessage}`;

  try {
    const { generateAgent } = await import("../utils/agentRunner.js");
    const result = await generateAgent(opts.targetId, [{ role: "user", content: fullMessage }], {
      allowCallAgent: false,
      ownerId: opts.ownerId,
      isGuest: opts.isGuest,
      abortSignal: opts.abortSignal,
      conversationId: opts.conversationId,
      enableMemory: opts.enableMemory,
    });
    return { success: true, agent_id: opts.targetId, response: result.text, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      agent_id: opts.targetId,
      response: null,
      error: isAbortError(err, opts.abortSignal) ? "cancelled" : msg,
    };
  }
}

/**
 * Build one tool per callable agent (tool-per-agent pattern).
 * Schema is only message/context — target agent is bound in the closure.
 */
export function makeCallAgentTools(options: MakeCallAgentToolsOptions): StructuredToolInterface[] {
  const { callerAgentId, targets, ownerId, isGuest = false, abortSignal, conversationId, enableMemory } = options;

  return targets.map((target) => {
    const toolName = callAgentToolName(target.id);
    const descSuffix = target.description ? ` ${target.description}` : "";

    return tool(
      async (rawArgs: { message?: string; context?: string; msg?: string }) => {
        const message = rawArgs?.message ?? rawArgs?.msg ?? "";
        if (!message.trim()) {
          return JSON.stringify({
            success: false,
            agent_id: target.id,
            response: null,
            error: "call_agent: message is required",
          });
        }

        const workAbort = new AbortController();
        const onParentAbort = () => workAbort.abort();
        if (abortSignal) {
          if (abortSignal.aborted) workAbort.abort();
          else abortSignal.addEventListener("abort", onParentAbort, { once: true });
        }

        const work = invokeSubAgent({
          callerAgentId,
          targetId: target.id,
          message,
          context: rawArgs?.context,
          ownerId,
          isGuest,
          abortSignal: workAbort.signal,
          conversationId,
          enableMemory,
        });
        void work.finally(() => {
          abortSignal?.removeEventListener("abort", onParentAbort);
        });

        return settleCallAgentWork({
          work,
          abort: workAbort,
          softWaitMs: CALL_AGENT_SOFT_WAIT_MS,
          toolId: `call-agent:${target.id}`,
          toolName: `Call ${target.name}`,
          targetId: target.id,
          agentId: callerAgentId,
          conversationId,
        });
      },
      {
        name: toolName,
        description: `Delegate a task to specialist agent "${target.name}".${descSuffix}

Use this when "${target.name}" is the right specialist for the job.
Be specific and detailed in your message. Include all context needed.
You CAN call multiple specialist tools in PARALLEL in the same step when tasks are independent.
If the specialist takes longer than two minutes, this returns status "running" with a taskId — use background_tasks (await/get/cancel). Do not re-call this tool to poll.`,
        schema: z.object({
          message: z.string().min(1).describe("The message or task to send to the agent. Be specific."),
          context: z.string().optional().describe("Optional extra context from your current task."),
        }),
      },
    );
  });
}
