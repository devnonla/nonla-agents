/**
 * Tool types — local replacement for Vercel AI SDK's Tool & ToolSet.
 *
 * These types match the shape used throughout the codebase
 * (inputSchema with .jsonSchema, description, execute).
 */

import { z } from "zod";

// ── InputSchema wrapper (mirrors AI SDK's zodSchema() output) ─────────────────

export interface ToolInputSchema {
  /** JSON Schema representation — used by useChatAgent to send to server */
  jsonSchema: Record<string, unknown>;
}

/**
 * Convert a Zod schema to ToolInputSchema.
 * Replaces `zodSchema()` from Vercel AI SDK.
 *
 * Uses Zod v4's built-in `z.toJsonSchema()`.
 */
export function zodSchema(schema: z.ZodType): ToolInputSchema {
  return { jsonSchema: z.toJSONSchema(schema) };
}

// ── Tool & ToolSet ────────────────────────────────────────────────────────────

export interface Tool {
  description: string;
  inputSchema: ToolInputSchema;
  execute?: (input: any, options?: any) => Promise<unknown>;
}

export type ToolSet = Record<string, Tool>;

/**
 * ToolHooks — FE callbacks fired when server-side tools are called.
 *
 * Hook nhận tool input, có thể:
 * - Trả void: tool đã execute xong ở server, hook chỉ làm side effect UI
 * - Trả Promise<unknown>: kết quả gửi lại server làm tool result cho AI
 */
export type ToolHooks = Record<string, (input: unknown) => Promise<unknown> | unknown | undefined>;
