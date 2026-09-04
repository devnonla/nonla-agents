import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getJobRun, listJobRuns, toPublicJobRun } from "../../jobs.service.js";

export function makeGetJobRunTool(jobId: string) {
  return tool(
    async ({ runId }) => {
      const id = runId?.trim();
      if (id) {
        const run = await getJobRun(id);
        if (!run || run.jobId !== jobId) {
          return JSON.stringify({ ok: false, error: `Run not found: ${id}` });
        }
        const pub = toPublicJobRun(run);
        return JSON.stringify({
          ok: true,
          run: {
            id: pub.id,
            status: pub.status,
            trigger: pub.trigger,
            error: pub.error,
            startedAt: pub.startedAt,
            finishedAt: pub.finishedAt,
            logs: pub.logs,
          },
        });
      }

      const latest = (await listJobRuns(jobId, { limit: "1" })).items[0];
      if (!latest) return JSON.stringify({ ok: false, error: "No runs yet" });
      return JSON.stringify({
        ok: true,
        run: {
          id: latest.id,
          status: latest.status,
          trigger: latest.trigger,
          error: latest.error,
          startedAt: latest.startedAt,
          finishedAt: latest.finishedAt,
          logs: latest.logs,
        },
      });
    },
    {
      name: "get_job_run",
      description: "Read a job run status + logs. Pass runId from run_current_job, or omit for the latest run. Use only when you need the outcome before fixing — do not busy-poll.",
      schema: z.object({
        runId: z.string().optional().describe("Job run id. Omit for the latest run of this job."),
      }),
    },
  );
}
