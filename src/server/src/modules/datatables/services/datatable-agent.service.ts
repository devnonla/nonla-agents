/**
 * datatable-agent.service.ts — Datatable assistant SSE streaming for a project.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { NotFoundException } from "../../../common/exceptions/http.exception.js";
import { PROJECT_ACTIONS, makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { buildDatatableAgentSystemPrompt } from "../common/datatable-agent-prompt.js";
import { getProject, getProjectSchema } from "../datatables.service.js";

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

export interface DatatableAgentStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

export function buildLangChainMessages(messages: DatatableAgentStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

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
      while (j < messages.length && messages[j].role === "tool-call") {
        toolMsgs.push(messages[j] as ToolCallMessage);
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

export async function streamDatatableAgent(projectId: string, body: DatatableAgentStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;
  const project = await getProject(projectId);
  if (!project) throw new NotFoundException("Project not found");

  const model = await getChatModel(providerId, modelId);
  const schema = await getProjectSchema(projectId);

  const tools: StructuredToolInterface[] = [makeDatatableTool(PROJECT_ACTIONS, { lockedProjectId: projectId })];
  const systemPrompt = buildDatatableAgentSystemPrompt(project, schema.tables);

  const agent = createAgent({
    model,
    tools,
    systemPrompt,
  });

  await streamAgentSSE({
    agent,
    messages: buildLangChainMessages(messages),
    maxSteps: 20,
    stream,
    abortSignal,
  });
}
