/**
 * getChatModel.ts (server-side)
 *
 * Resolve BaseChatModel từ agent.aiProvider (UUID) + agent.aiModel.
 * Đọc trực tiếp từ DB — không cần HTTP round-trip.
 *
 * Replaces getLanguageModel.ts (Vercel AI SDK) with LangChain chat models.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { eq } from "drizzle-orm";
import { decryptProviderApiKey } from "../../modules/llm-providers/llm-providers.service.js";
import { getDb, llmProviders } from "../db/client.js";

export async function getChatModel(providerId: string, modelId: string): Promise<BaseChatModel> {
  const db = getDb();
  const p = db.select().from(llmProviders).where(eq(llmProviders.id, providerId)).get();

  if (!p) {
    throw new Error(`Provider "${providerId}" not found in DB`);
  }

  const provider = p.provider;
  const apiKey = decryptProviderApiKey(p.apiKey);
  const customBaseUrl = p.customBaseUrl;
  const baseURL = customBaseUrl?.trim() || undefined;

  if (provider === "openai" || provider === "custom") {
    // Enable reasoning summary for o-series models (o1, o3-mini, o4-mini)
    const isReasoningModel = /^o[134]/.test(modelId);
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      streamUsage: true,
      ...(baseURL ? { configuration: { baseURL } } : {}),
      ...(isReasoningModel
        ? {
            useResponsesApi: true,
            reasoning: { effort: "medium" },
            // NOTE: add `summary: "auto"` to reasoning once org is verified at
            // https://platform.openai.com/settings/organization/general
          }
        : {}),
    });
  }

  if (provider === "ollama") {
    const base = (baseURL ?? "http://localhost:11434").replace(/\/$/, "");
    return new ChatOpenAI({
      model: modelId,
      apiKey: apiKey || "ollama",
      streamUsage: true,
      configuration: { baseURL: `${base}/v1` },
    });
  }

  if (provider === "openrouter") {
    const { ChatOpenRouter } = await import("@langchain/openrouter");
    // Only request reasoning for models that separate CoT from the final answer.
    // Blanket enable makes some models (e.g. deepseek-v4-flash) put the entire
    // reply into delta.reasoning / reasoning_content with empty content — UI then
    // shows Thinking only and never an assistant message.
    const wantsReasoning = /(?:^|\/)(o[134][\w.-]*|gpt-5[\w.-]*|deepseek-r1[\w.-]*|qwq[\w.-]*|claude[\w.-]*)/i.test(modelId) || /thinking|reason/i.test(modelId);
    return new ChatOpenRouter({
      model: modelId,
      apiKey,
      streamUsage: true,
      ...(wantsReasoning
        ? {
            modelKwargs: {
              reasoning: { enabled: true, effort: "medium" },
            },
          }
        : {}),
      // streamUsage accepted at runtime; package typings may lag
    } as never);
  }

  if (provider === "anthropic") {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      model: modelId,
      apiKey,
      streamUsage: true,
      ...(baseURL ? { clientOptions: { baseURL } } : {}),
    });
  }

  if (provider === "google") {
    const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
    return new ChatGoogleGenerativeAI({
      model: modelId,
      apiKey,
      streamUsage: true,
      ...(baseURL ? { baseUrl: baseURL } : {}),
    });
  }

  // Fallback: OpenAI-compatible with custom baseURL
  if (baseURL) {
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      streamUsage: true,
      configuration: { baseURL },
    });
  }

  throw new Error(`Provider type "${provider}" not supported`);
}
