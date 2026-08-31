import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runDraftJobCode } from "../../jobs-runner.js";

export function makeRunCurrentJobTool(jobId: string) {
  return tool(
    async () => {
      const result = runDraftJobCode(jobId);
      if (result.started) {
        return JSON.stringify({
          started: true,
          runId: result.runId,
          message: "Run started. Logs stream live in the Runs panel. Do NOT wait or poll unless you need the outcome to fix a failure.",
        });
      }
      return JSON.stringify({ started: false, error: result.error });
    },
    {
      name: "run_current_job",
      description: "Start the current TypeScript job draft (same as manual Run). Returns immediately with { started, runId } — does not wait for completion. REQUIRED right after every edit_code. Logs appear live in the Runs panel.",
      schema: z.object({}),
    },
  );
}
