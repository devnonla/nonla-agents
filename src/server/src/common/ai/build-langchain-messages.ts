import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

export interface ChatToolCallMessage {
  role: "tool-call";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
}

export interface ChatTextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export type ChatHistoryMessage = ChatTextMessage | ChatToolCallMessage;

export function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function toToolCall(tc: ChatToolCallMessage, fallbackId: string) {
  return {
    id: tc.toolCallId || fallbackId,
    name: tc.toolName || "unknown",
    args: toolCallArgs(tc.toolInput),
    type: "tool_call" as const,
  };
}

/** Convert ChatAgent JSON history into LangChain `BaseMessage[]`. */
export function buildLangChainMessages(messages: ChatHistoryMessage[]): BaseMessage[] {
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
      const toolMsgs: ChatToolCallMessage[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === "tool-call") {
        toolMsgs.push(messages[j] as ChatToolCallMessage);
        j++;
      }
      if (toolMsgs.length > 0) {
        result.push(
          new AIMessage({
            content: msg.content || "",
            tool_calls: toolMsgs.map((tc, idx) => toToolCall(tc, `tc-${i + 1 + idx}`)),
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
      const tc = msg;
      const toolCallId = tc.toolCallId || `tc-${i}`;
      result.push(
        new AIMessage({
          content: "",
          tool_calls: [toToolCall(tc, toolCallId)],
        }),
      );
      result.push(new ToolMessage({ content: tc.toolOutput ?? "", tool_call_id: toolCallId }));
    }
  }

  return result;
}
