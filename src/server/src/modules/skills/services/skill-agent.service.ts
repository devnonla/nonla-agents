import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { fetchUrlTool } from "../../../common/ai/agent-tools/fetch-url.tool.js";
import { createCompactEditMiddleware, redactEditHistoryPayloads } from "../../../common/ai/compact-edit-middleware.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { buildSkillAgentSystemPrompt, makeDeleteSkillFileTool, makeEditSkillFileTool, makeReadSkillFileTool } from "../common/agent-tools/edit-skill-file.tool.js";
import { getSkill } from "../skills.service.js";

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

export interface SkillStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function buildLangChainMessages(messages: SkillStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const compacted = redactEditHistoryPayloads(messages, undefined, { keepLatestOutput: true });

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
          tool_calls: [{ id: toolCallId, name: tc.toolName || "unknown", args: toolCallArgs(tc.toolInput) }],
        }),
      );
      result.push(new ToolMessage({ content: tc.toolOutput ?? "", tool_call_id: toolCallId }));
    }
  }

  return result;
}

export async function streamSkillAgent(skillId: string, body: SkillStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  try {
    if (!(await getSkill(skillId))) {
      throw new Error("Skill not found");
    }

    const { providerId, modelId, messages } = body;
    const model = await getChatModel(providerId, modelId);

    const tools: StructuredToolInterface[] = [makeReadSkillFileTool(skillId), makeEditSkillFileTool(skillId), makeDeleteSkillFileTool(skillId), browserTool, fetchUrlTool];

    const agent = createAgent({
      model,
      tools,
      systemPrompt: await buildSkillAgentSystemPrompt(skillId),
      middleware: [createCompactEditMiddleware()],
    });

    await streamAgentSSE({
      agent,
      messages: buildLangChainMessages(messages),
      maxSteps: 20,
      stream,
      abortSignal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await stream.writeSSE({
      data: JSON.stringify({ type: "error", error: msg }),
    });
  }
}
