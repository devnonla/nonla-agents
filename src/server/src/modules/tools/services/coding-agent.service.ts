/**
 * coding-agent.service.ts — Coding Agent SSE streaming service.
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
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeEditCodeTool } from "../common/agent-tools/edit-code.tool.js";
import { makeRunCurrentScriptTool } from "../common/agent-tools/run-current-script.tool.js";
import { buildCodingSystemPrompt } from "../common/constants.js";
import { getDraftCode, getTool } from "../tools.service.js";

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

export interface CodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

export function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/** Cross-turn: redact edit args; keep the latest successful current_code snapshot. */
export function compactGenerateCodeHistory(messages: CodingStreamRequest["messages"]): CodingStreamRequest["messages"] {
  return redactEditHistoryPayloads(messages, undefined, { keepLatestOutput: true });
}

export function buildLangChainMessages(messages: CodingStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const compacted = compactGenerateCodeHistory(messages);

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
            content: msg.content,
            tool_calls: toolMsgs.map((tc, idx) => ({
              id: tc.toolCallId || `tc-${i + 1 + idx}`,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
            })),
          }),
        );

        for (let k = 0; k < toolMsgs.length; k++) {
          const tc = toolMsgs[k];
          result.push(
            new ToolMessage({
              content: tc.toolOutput ?? "",
              tool_call_id: tc.toolCallId || `tc-${i + 1 + k}`,
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
      const toolCallId = tc.toolCallId || `tc-${i}`;

      result.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              name: tc.toolName || "unknown",
              args: toolCallArgs(tc.toolInput),
            },
          ],
        }),
      );

      result.push(
        new ToolMessage({
          content: tc.toolOutput ?? "",
          tool_call_id: toolCallId,
        }),
      );
    }
  }

  return result;
}

export async function streamCodingAgent(toolId: string, body: CodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;

  const model = await getChatModel(providerId, modelId);

  const tools: StructuredToolInterface[] = [makeEditCodeTool(toolId), makeRunCurrentScriptTool(toolId), makeNonlaagentsGuideTool("tools"), browserTool, fetchUrlTool, makeKvStoreTool(["list"]), makeSecretsTool(["list"]), makeDatatableTool(["list_projects", "get_schema"])];

  const currentCode = await getDraftCode(toolId);
  const toolRow = await getTool(toolId);
  const systemPrompt = buildCodingSystemPrompt(currentCode, toolRow);
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
