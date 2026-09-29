/**
 * job-coding-agent.service.ts — Job coding assistant SSE streaming.
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
import { makeAgentsTool } from "../../agents/runtime/llm-tools/agents.tool.js";
import { makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { makeKvStoreTool } from "../../agents/runtime/llm-tools/kv-store.tool.js";
import { makeSecretsTool } from "../../agents/runtime/llm-tools/secrets.tool.js";
import { makeJobEditCodeTool } from "../common/agent-tools/edit-code.tool.js";
import { makeGetJobRunTool } from "../common/agent-tools/get-job-run.tool.js";
import { makeReadCurrentCodeTool } from "../common/agent-tools/read-current-code.tool.js";
import { makeRunCurrentJobTool } from "../common/agent-tools/run-current-job.tool.js";
import { buildJobCodingSystemPrompt } from "../common/job-agent-prompt.js";
import { getJob } from "../jobs.service.js";

export interface JobCodingStreamRequest {
  providerId: string;
  modelId: string;
  messages: ChatHistoryMessage[];
}

export async function streamJobCodingAgent(jobId: string, body: JobCodingStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;
  const model = await getChatModel(providerId, modelId);

  const tools: StructuredToolInterface[] = [
    makeReadCurrentCodeTool(jobId),
    makeJobEditCodeTool(jobId),
    makeRunCurrentJobTool(jobId),
    makeGetJobRunTool(jobId),
    makeNonlaagentsGuideTool("jobs"),
    webFetchTool,
    makeRunJsTool({ abortSignal }),
    makeKvStoreTool(["list"]),
    makeSecretsTool(["list"]),
    makeDatatableTool(["list_projects", "get_schema"]),
    makeAgentsTool(["list", "get"]),
  ];

  const job = await getJob(jobId);
  const systemPrompt = buildJobCodingSystemPrompt(job);
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
