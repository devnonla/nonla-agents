/**
 * generate_prompt — prompt assistant builtin tool.
 *
 * Writes a pending `systemPromptDraft`. Chat still uses published `systemPrompt`
 * until the user approves the draft in Instruct.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateAgent } from "../../agents.service.js";

const schema = z.object({
  prompt: z.string().describe("The complete new system prompt. Written as a draft; not live until the user Approves."),
  summary: z.string().optional().describe("A short description of the draft (shown to the user)."),
});

/**
 * Creates a generate_prompt tool bound to a specific agentId.
 * When invoked, it writes the prompt draft to DB and emits agents:updated via WS.
 */
export function makeGeneratePromptTool(agentId: string) {
  return tool(
    async ({ prompt, summary }) => {
      updateAgent(agentId, { systemPromptDraft: prompt });

      return JSON.stringify({
        ok: true,
        message: summary ?? "Draft ready. The user must Approve it in Instruct before chat uses it.",
      });
    },
    {
      name: "generate_prompt",
      description: "Write or replace the agent's system prompt draft. Always use this tool when writing or editing a prompt. NEVER return the prompt as text in the conversation. Does not publish — chat keeps the live prompt until the user Approves.",
      schema,
    },
  );
}
