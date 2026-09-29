/**
 * read_current_code — coding assistant tool.
 *
 * Returns the editor working copy (draft if present, else published) as plain source.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getDraftCode } from "../../jobs.service.js";

export function makeReadCurrentCodeTool(jobId: string) {
  return tool(
    async () => {
      const code = await getDraftCode(jobId);
      if (code == null) {
        return "Error: Job not found";
      }
      return code;
    },
    {
      name: "read_current_code",
      description: "Read the TypeScript job script currently in the editor (draft if present, else published). Call before editing and whenever replace fails so old_string matches exact current text. Returns the source as plain text — not JSON. Empty string when the editor has no content yet.",
      schema: z.object({}),
    },
  );
}
