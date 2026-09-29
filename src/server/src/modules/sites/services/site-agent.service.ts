/**
 * site-agent.service.ts — Site coding assistant SSE streaming.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { makeNonlaagentsGuideTool } from "../../../common/ai/agent-tools/nonlaagents-guide.tool.js";
import { makeRunJsTool } from "../../../common/ai/agent-tools/run-js.tool.js";
import { webFetchTool } from "../../../common/ai/agent-tools/web-fetch.tool.js";
import { type ChatHistoryMessage, buildLangChainMessages } from "../../../common/ai/build-langchain-messages.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { resolvePublicBaseUrl } from "../../../common/spa-html.js";
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeCheckSiteTool } from "../common/agent-tools/check-site.tool.js";
import { makeEditSiteFilesTool } from "../common/agent-tools/edit-site-surface.tool.js";
import { makePreviewSiteTool } from "../common/agent-tools/preview-site.tool.js";
import { makeReadSiteFilesTool } from "../common/agent-tools/read-site-files.tool.js";
import { buildSiteAgentSystemPrompt } from "../common/site-agent-prompt.js";
import { getSite } from "../sites.service.js";

export interface SiteAgentStreamRequest {
  providerId: string;
  modelId: string;
  messages: ChatHistoryMessage[];
  /** Browser origin (window.location.origin) — used when PUBLIC_BASE_URL is unset */
  publicOrigin?: string;
}

export async function streamSiteAgent(siteId: string, body: SiteAgentStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal, request?: Request): Promise<void> {
  try {
    const { providerId, modelId, messages, publicOrigin } = body;
    const site = await getSite(siteId);
    const model = await getChatModel(providerId, modelId);
    const publicBaseUrl = resolvePublicBaseUrl({ request, clientOrigin: publicOrigin });

    const tools: StructuredToolInterface[] = [
      makeReadSiteFilesTool(siteId),
      makeEditSiteFilesTool(siteId),
      makeCheckSiteTool(siteId),
      makePreviewSiteTool(siteId),
      makeNonlaagentsGuideTool("sites"),
      webFetchTool,
      makeRunJsTool({ abortSignal }),
      makeKvStoreTool(["list"]),
      makeSecretsTool(["list"]),
      makeDatatableTool(["list_projects", "get_schema"]),
    ];

    const systemPrompt = buildSiteAgentSystemPrompt({
      name: site.name,
      slug: site.slug,
      publicBaseUrl: publicBaseUrl || undefined,
    });
    const agent = createAgent({
      model,
      tools,
      systemPrompt,
    });

    await streamAgentSSE({
      agent,
      messages: buildLangChainMessages(messages),
      maxSteps: 30,
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
