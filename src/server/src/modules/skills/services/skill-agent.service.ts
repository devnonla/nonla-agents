import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { makeRunJsTool } from "../../../common/ai/agent-tools/run-js.tool.js";
import { webFetchTool } from "../../../common/ai/agent-tools/web-fetch.tool.js";
import { type ChatHistoryMessage, buildLangChainMessages } from "../../../common/ai/build-langchain-messages.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { buildSkillAgentSystemPrompt, makeDeleteSkillFileTool, makeEditSkillFileTool, makeReadSkillFileTool } from "../common/agent-tools/edit-skill-file.tool.js";
import { getSkill } from "../skills.service.js";

export interface SkillStreamRequest {
  providerId: string;
  modelId: string;
  messages: ChatHistoryMessage[];
}

export async function streamSkillAgent(skillId: string, body: SkillStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  try {
    if (!(await getSkill(skillId))) {
      throw new Error("Skill not found");
    }

    const { providerId, modelId, messages } = body;
    const model = await getChatModel(providerId, modelId);

    const tools: StructuredToolInterface[] = [makeReadSkillFileTool(skillId), makeEditSkillFileTool(skillId), makeDeleteSkillFileTool(skillId), webFetchTool, makeRunJsTool({ abortSignal })];

    const agent = createAgent({
      model,
      tools,
      systemPrompt: await buildSkillAgentSystemPrompt(skillId),
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
