/**
 * run_current_script — coding assistant builtin tool.
 *
 * Reads draftCode via tools service, runs it via the Bun/TypeScript sandbox.
 * AI only passes testInput — code is read from DB automatically.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runDraftCode } from "../../tools.service.js";

export function makeRunCurrentScriptTool(toolId: string) {
  return tool(
    async ({ testInput }) => {
      const inputJson = JSON.stringify(testInput ?? {});
      const resultStr = await runDraftCode(toolId, inputJson);

      if (!resultStr) {
        return JSON.stringify({ success: false, error: "No draft code available. Use edit_code first." });
      }

      try {
        const parsed = JSON.parse(resultStr);
        if (parsed.ok) {
          return JSON.stringify({ success: true, output: parsed.result, console: parsed.console });
        }
        return JSON.stringify({ success: false, error: parsed.error, console: parsed.console });
      } catch {
        return resultStr;
      }
    },
    {
      name: "run_current_script",
      description: "Run the latest code in a Bun sandbox.",
      schema: z.object({
        testInput: z.record(z.string(), z.unknown()).optional().describe("Parameters object to pass into the script. Keys must match the tool's // @param annotations. Example: { query: 'lofi music', limit: 5 }"),
      }),
    },
  );
}
