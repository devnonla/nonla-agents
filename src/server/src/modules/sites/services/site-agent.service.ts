/**
 * site-agent.service.ts — Site coding assistant SSE streaming.
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
import { resolvePublicBaseUrl } from "../../../common/spa-html.js";
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeCheckSiteTool } from "../common/agent-tools/check-site.tool.js";
import { makeAllSiteEditTools } from "../common/agent-tools/edit-site-surface.tool.js";
import { makePreviewSiteTool } from "../common/agent-tools/preview-site.tool.js";
import { makeReadSiteFilesTool } from "../common/agent-tools/read-site-files.tool.js";
import { buildSiteAgentSystemPrompt } from "../common/site-agent-prompt.js";
import { getSite } from "../sites.service.js";

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

export interface SiteAgentStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
  /** Browser origin (window.location.origin) — used when PUBLIC_BASE_URL is unset */
  publicOrigin?: string;
}

export function toolCallArgs(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/** Cross-turn: redact ALL site edit payloads (including latest). */
export function compactSiteWriteHistory(messages: SiteAgentStreamRequest["messages"]): SiteAgentStreamRequest["messages"] {
  return redactEditHistoryPayloads(messages);
}

function appendToolResults(result: BaseMessage[], toolMsgs: ToolCallMessage[], idFallback: (k: number) => string) {
  for (let k = 0; k < toolMsgs.length; k++) {
    const tc = toolMsgs[k];
    result.push(
      new ToolMessage({
        content: tc.toolOutput ?? "",
        tool_call_id: tc.toolCallId || idFallback(k),
      }),
    );
  }
}

export function buildLangChainMessages(messages: SiteAgentStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const compacted = compactSiteWriteHistory(messages);

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
        appendToolResults(result, toolMsgs, (k) => `tc-${i + 1 + k}`);
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
      result.push(new ToolMessage({ content: tc.toolOutput ?? "", tool_call_id: toolCallId }));
    }
  }

  return result;
}

export async function streamSiteAgent(siteId: string, body: SiteAgentStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal, request?: Request): Promise<void> {
  const { providerId, modelId, messages, publicOrigin } = body;
  const site = getSite(siteId);
  const model = await getChatModel(providerId, modelId);
  const publicBaseUrl = resolvePublicBaseUrl({ request, clientOrigin: publicOrigin });

  const tools: StructuredToolInterface[] = [
    makeReadSiteFilesTool(siteId),
    ...makeAllSiteEditTools(siteId),
    makeCheckSiteTool(siteId),
    makePreviewSiteTool(siteId),
    makeNonlaagentsGuideTool("sites"),
    browserTool,
    fetchUrlTool,
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
  ];

  const systemPrompt = buildSiteAgentSystemPrompt(siteId, {
    name: site.name,
    slug: site.slug,
    publicBaseUrl: publicBaseUrl || undefined,
  });
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
    middleware: [createCompactEditMiddleware()],
  });

  await streamAgentSSE({
    agent,
    messages: buildLangChainMessages(messages),
    maxSteps: 30,
    stream,
    abortSignal,
  });
}
