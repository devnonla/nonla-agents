import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { requireRole } from "../../common/middleware/auth.middleware.js";
import { cancelJobRun, startClaimedRun } from "./jobs-runner.js";
import { createJob, deleteJob, getJob, getJobRun, listJobRuns, listJobs, toPublicJob, toPublicJobRun, tryClaimJob, updateJob } from "./jobs.service.js";
import { type JobCodingStreamRequest, streamJobCodingAgent } from "./services/job-coding-agent.service.js";

const app = new Hono();

app.use("*", requireRole("admin"));

app.get("/", (c) => c.json(listJobs(c.req.query())));

app.post("/:id/coding/stream", async (c) => {
  const jobId = c.req.param("id");
  if (!getJob(jobId)) throw new BadRequestException("Job not found");
  const body = await c.req.json<JobCodingStreamRequest>();
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    await streamJobCodingAgent(jobId, body, stream, abort.signal);
  });
});

app.get("/:id", (c) => {
  const job = getJob(c.req.param("id"));
  if (!job) throw new BadRequestException("Job not found");
  return c.json(toPublicJob(job));
});

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(createJob(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateJob(c.req.param("id"), body));
});

app.delete("/:id", (c) => {
  deleteJob(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/:id/runs", (c) => {
  return c.json(listJobRuns(c.req.param("id"), c.req.query()));
});

app.get("/:id/runs/:runId", (c) => {
  const run = getJobRun(c.req.param("runId"));
  if (!run || run.jobId !== c.req.param("id")) throw new BadRequestException("Run not found");
  return c.json(toPublicJobRun(run));
});

app.post("/:id/run", (c) => {
  const jobId = c.req.param("id");
  const job = getJob(jobId);
  if (!job) throw new BadRequestException("Job not found");

  const claimed = tryClaimJob(jobId, "manual");
  if (!claimed) {
    throw new BadRequestException("Job is already running or could not be claimed");
  }

  startClaimedRun(claimed.job.id, claimed.run.id, false);
  return c.json(claimed.run, 202);
});

app.post("/:id/runs/:runId/cancel", (c) => {
  return c.json(cancelJobRun(c.req.param("id"), c.req.param("runId")));
});

export default app;
