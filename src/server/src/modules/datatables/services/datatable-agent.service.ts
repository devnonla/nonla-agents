/**
 * datatable-agent.service.ts — Datatable assistant SSE streaming for a project.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { type ChatHistoryMessage, buildLangChainMessages } from "../../../common/ai/build-langchain-messages.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { NotFoundException } from "../../../common/exceptions/http.exception.js";
import { PROJECT_ACTIONS, makeDatatableTool } from "../../agents/runtime/llm-tools/datatable.tool.js";
import { buildDatatableAgentSystemPrompt } from "../common/datatable-agent-prompt.js";
import { getProject, getProjectSchema } from "../datatables.service.js";

export interface DatatableAgentStreamRequest {
  providerId: string;
  modelId: string;
  messages: ChatHistoryMessage[];
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
