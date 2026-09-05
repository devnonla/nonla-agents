/**
 * job-coding-agent.service.ts — Job coding assistant SSE streaming.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { fetchUrlTool } from "../../../common/ai/agent-tools/fetch-url.tool.js";
import { makeNonlaagentsGuideTool } from "../../../common/ai/agent-tools/nonlaagents-guide.tool.js";
import { createCompactEditMiddleware, redactEditHistoryPayloads } from "../../../common/ai/compact-edit-middleware.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { makeAgentsTool } from "../../agents/runtime/llm-tools/agents.tool.js";
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeJobEditCodeTool } from "../common/agent-tools/edit-code.tool.js";
import { makeGetJobRunTool } from "../common/agent-tools/get-job-run.tool.js";
import { makeRunCurrentJobTool } from "../common/agent-tools/run-current-job.tool.js";
import { buildJobCodingSystemPrompt } from "../common/job-agent-prompt.js";
import { getDraftCode, getJob } from "../jobs.service.js";

interface ToolCallMessage {
  role: "tool-call";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
}

interface TextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface JobCodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function compactEditCodeHistory(messages: JobCodingStreamRequest["messages"]): JobCodingStreamRequest["messages"] {
  return redactEditHistoryPayloads(messages, undefined, { keepLatestOutput: true });
}

function buildLangChainMessages(messages: JobCodingStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const compacted = compactEditCodeHistory(messages);

  for (let i = 0; i < compacted.length; i++) {
    const msg = compacted[i];

    if (msg.role === "user") {
      result.push(new HumanMessage(msg.content));
      continue;
    }
    if (msg.role === "system") {
      result.push(new SystemMessage(msg.content));
      continue;
    }
    if (msg.role === "assistant") {
      const toolMsgs: ToolCallMessage[] = [];
      let j = i + 1;
      while (j < compacted.length && compacted[j].role === "tool-call") {
        toolMsgs.push(compacted[j] as ToolCallMessage);
        j++;
      }
      if (toolMsgs.length > 0) {
        result.push(
          new AIMessage({
            content: msg.content || "",
            tool_calls: toolMsgs.map((tc, idx) => ({
              id: tc.toolCallId || `call_${i + 1 + idx}`,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
              type: "tool_call" as const,
            })),
          }),
        );
        for (let k = 0; k < toolMsgs.length; k++) {
          const tc = toolMsgs[k];
          result.push(
            new ToolMessage({
              content: tc.toolOutput ?? "",
              tool_call_id: tc.toolCallId || `call_${i + 1 + k}`,
            }),
          );
        }
        i = j - 1;
      } else {
        result.push(new AIMessage(msg.content));
      }
      continue;
    }

    if (msg.role === "tool-call") {
      const tc = msg as ToolCallMessage;
      const toolCallId = tc.toolCallId || `call_${i}`;
      result.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
              type: "tool_call" as const,
            },
          ],
        }),
      );
      result.push(new ToolMessage({ content: tc.toolOutput ?? "", tool_call_id: toolCallId }));
    }
  }

  return result;
}

export async function streamJobCodingAgent(jobId: string, body: JobCodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;
  const model = await getChatModel(providerId, modelId);

  const tools: StructuredToolInterface[] = [
    makeJobEditCodeTool(jobId),
    makeRunCurrentJobTool(jobId),
    makeGetJobRunTool(jobId),
    makeNonlaagentsGuideTool("jobs"),
    browserTool,
    fetchUrlTool,
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
    makeAgentsTool(["list", "get"]),
  ];

  const currentCode = await getDraftCode(jobId);
  const job = await getJob(jobId);
  const systemPrompt = buildJobCodingSystemPrompt(currentCode, job);
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
    middleware: [createCompactEditMiddleware()],
  });
  const baseMessages = buildLangChainMessages(messages);

  await streamAgentSSE({
    agent,
    messages: baseMessages,
    maxSteps: 20,
    stream,
    abortSignal,
  });
}
