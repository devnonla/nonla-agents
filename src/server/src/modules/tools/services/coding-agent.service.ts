/**
 * coding-agent.service.ts — Coding Agent SSE streaming service.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { makeNonlaagentsGuideTool } from "../../../common/ai/agent-tools/nonlaagents-guide.tool.js";
import { makeRunJsTool } from "../../../common/ai/agent-tools/run-js.tool.js";
import { searchNpmTool } from "../../../common/ai/agent-tools/search-npm.tool.js";
import { webFetchTool } from "../../../common/ai/agent-tools/web-fetch.tool.js";
import { type ChatHistoryMessage, buildLangChainMessages } from "../../../common/ai/build-langchain-messages.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeEditCodeTool } from "../common/agent-tools/edit-code.tool.js";
import { makeReadCurrentCodeTool } from "../common/agent-tools/read-current-code.tool.js";
import { makeRunCurrentScriptTool } from "../common/agent-tools/run-current-script.tool.js";
import { buildCodingSystemPrompt } from "../common/constants.js";
import { getTool } from "../tools.service.js";

export interface CodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: ChatHistoryMessage[];
}

export async function streamCodingAgent(toolId: string, body: CodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  try {
    const toolRow = await getTool(toolId);
    if (!toolRow) {
      throw new Error("Tool not found");
    }

    const { providerId, modelId, messages } = body;
    const model = await getChatModel(providerId, modelId);

    const tools: StructuredToolInterface[] = [
      makeReadCurrentCodeTool(toolId),
      makeEditCodeTool(toolId),
      makeRunCurrentScriptTool(toolId, abortSignal),
      makeNonlaagentsGuideTool("tools"),
      searchNpmTool,
      webFetchTool,
      makeRunJsTool({ abortSignal }),
      makeKvStoreTool(["list"]),
      makeSecretsTool(["list"]),
      makeDatatableTool(["list_projects", "get_schema"]),
    ];

    const systemPrompt = buildCodingSystemPrompt(toolRow);
    const agent = createAgent({
      model,
      tools,
      systemPrompt,
    });

    await streamAgentSSE({
      agent,
      messages: buildLangChainMessages(messages),
      maxSteps: 50,
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
