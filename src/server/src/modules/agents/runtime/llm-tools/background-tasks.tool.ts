/**
 * background-tasks.tool.ts — Always-on builtin to manage soft-detached custom tool runs.
 */

import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { DEFAULT_AWAIT_MS, bgTaskRegistry } from "../../../tools/common/bg-task-registry.js";

const ALL_ACTIONS = ["list", "get", "await", "cancel"] as const;
type BgAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<BgAction, string> = {
  list: "**list**: List recent background tool tasks (running and finished).",
  get: "**get**: Read one task by `taskId` (status + result/error if finished).",
  await: "**await**: Wait up to `timeout_ms` for a task to finish (returns early when done). Requires `taskId`.",
  cancel: "**cancel**: Kill a running task. Requires `taskId`.",
};

export type MakeBackgroundTasksToolOptions = {
  agentId?: string;
  conversationId?: string | null;
};

export function makeBackgroundTasksTool(options: MakeBackgroundTasksToolOptions = {}): StructuredToolInterface {
  const description = `Manage long-running custom tool executions that returned \`status: "running"\` with a \`taskId\`.

Do NOT re-call the original tool to poll. Use this tool instead.
Prefer \`await\` over busy \`get\` loops. There is no sleep tool.

Available actions:
${ALL_ACTIONS.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}`;

  return tool(
    async ({
      action,
      taskId,
      timeout_ms,
    }: {
      action: string;
      taskId?: string;
      timeout_ms?: number;
    }) => {
      try {
        if (!(ALL_ACTIONS as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${ALL_ACTIONS.join(", ")}.` });
        }

        if (action === "list") {
          const items = bgTaskRegistry.list({
            agentId: options.agentId,
            conversationId: options.conversationId,
          });
          return JSON.stringify({ ok: true, count: items.length, items });
        }

        const id = taskId?.trim() ?? "";
        if (!id) return JSON.stringify({ ok: false, error: "'taskId' is required for get/await/cancel." });

        if (action === "get") {
          const task = bgTaskRegistry.get(id);
          if (!task) return JSON.stringify({ ok: false, error: `Task not found: ${id}` });
          return JSON.stringify({ ok: true, task });
        }

        if (action === "await") {
          const timeoutMs = typeof timeout_ms === "number" && timeout_ms > 0 ? Math.floor(timeout_ms) : DEFAULT_AWAIT_MS;
          const task = await bgTaskRegistry.await(id, timeoutMs);
          return JSON.stringify({ ok: true, task });
        }

        if (action === "cancel") {
          const task = bgTaskRegistry.cancel(id);
          if (!task) return JSON.stringify({ ok: false, error: `Task not found: ${id}` });
          return JSON.stringify({ ok: true, task });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "background_tasks",
      description,
      schema: z.object({
        action: z.enum(ALL_ACTIONS).describe("Operation to perform"),
        taskId: z.string().optional().describe("Background task id (required for get/await/cancel)"),
        timeout_ms: z.number().optional().describe(`Max wait for await (default ${DEFAULT_AWAIT_MS})`),
      }),
    },
  );
}

export const backgroundTasksTool = makeBackgroundTasksTool();

export const TOOL_DEF = {
  toolName: "background_tasks",
  toolLabel: "Background Tasks",
  description: "Manage soft-detached custom tool runs (list/get/await/cancel). Use when a custom tool returns status=running with a taskId.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...ALL_ACTIONS] },
      taskId: { type: "string", description: "Background task id (required for get/await/cancel)" },
      timeout_ms: { type: "number", description: `Max wait for await (default ${DEFAULT_AWAIT_MS})` },
    },
    required: ["action"],
  },
};
