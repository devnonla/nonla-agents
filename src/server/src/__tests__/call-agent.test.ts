import { afterEach, describe, expect, test } from "bun:test";
import { type CallAgentOutcome, settleCallAgentWork } from "../modules/agents/runtime/llm-tools/call-agent.tool.js";
import { bgTaskRegistry } from "../modules/tools/common/bg-task-registry.js";

function pendingOutcome(): {
  work: Promise<CallAgentOutcome>;
  resolve: (value: CallAgentOutcome) => void;
} {
  let resolve!: (value: CallAgentOutcome) => void;
  const work = new Promise<CallAgentOutcome>((r) => {
    resolve = r;
  });
  return { work, resolve };
}

const ok = (response: string, agentId = "agent-target"): CallAgentOutcome => ({
  success: true,
  agent_id: agentId,
  response,
  error: null,
});

describe("call_agent soft-wait", () => {
  afterEach(() => {
    bgTaskRegistry._reset();
  });

  test("completes within soft-wait returns outcome JSON", async () => {
    const abort = new AbortController();
    const out = await settleCallAgentWork({
      work: Promise.resolve(ok("hello")),
      abort,
      softWaitMs: 5_000,
      toolId: "call-agent:agent-target",
      toolName: "Call Reviewer",
      targetId: "agent-target",
      agentId: "agent-caller",
    });
    const parsed = JSON.parse(out) as CallAgentOutcome;
    expect(parsed.success).toBe(true);
    expect(parsed.response).toBe("hello");
    expect(parsed.agent_id).toBe("agent-target");
    expect(bgTaskRegistry.list()).toHaveLength(0);
  });

  test("exceeds soft-wait detaches then await completes", async () => {
    const abort = new AbortController();
    const { work, resolve } = pendingOutcome();
    const out = await settleCallAgentWork({
      work,
      abort,
      softWaitMs: 40,
      toolId: "call-agent:agent-target",
      toolName: "Call Reviewer",
      targetId: "agent-target",
      agentId: "agent-caller",
      conversationId: "conv-1",
    });
    const parsed = JSON.parse(out) as { status: string; taskId: string; agent_id: string };
    expect(parsed.status).toBe("running");
    expect(parsed.agent_id).toBe("agent-target");
    expect(typeof parsed.taskId).toBe("string");

    const listed = bgTaskRegistry.list({ conversationId: "conv-1" });
    expect(listed.some((t) => t.taskId === parsed.taskId)).toBe(true);

    resolve(ok("done later"));
    const finished = await bgTaskRegistry.await(parsed.taskId, 5_000);
    expect(finished.status).toBe("completed");
    expect(finished.result).toEqual(ok("done later"));
  });

  test("cancel aborts a detached call_agent", async () => {
    const abort = new AbortController();
    const { work } = pendingOutcome();
    const out = await settleCallAgentWork({
      work,
      abort,
      softWaitMs: 40,
      toolId: "call-agent:agent-target",
      toolName: "Call Reviewer",
      targetId: "agent-target",
    });
    const parsed = JSON.parse(out) as { status: string; taskId: string };
    expect(parsed.status).toBe("running");

    const cancelled = bgTaskRegistry.cancel(parsed.taskId);
    expect(cancelled?.status).toBe("cancelled");
    expect(abort.signal.aborted).toBe(true);
  });
});
