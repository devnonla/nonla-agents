import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { finishJobRun, getJob, getJobRun, tryClaimJob } from "../modules/jobs/jobs.service.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

async function waitForRun(runId: string, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = getJobRun(runId);
    if (run && run.status !== "running") return run;
    await Bun.sleep(50);
  }
  throw new Error(`Run ${runId} did not finish within ${timeoutMs}ms`);
}

describe("Jobs API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let jobId: string;

  beforeAll(async () => {
    process.env.ENABLE_SCHEDULER = "false";
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => cleanup());

  test("POST /api/jobs — create job", async () => {
    const res = await authRequest(app, token, "POST", "/api/jobs", {
      name: "Daily ping",
      cron: "0 9 * * *",
      code: `import nonlaagents from "@nonla-agents/runtime";
await nonlaagents.step("hello", async () => {
  nonlaagents.log.info("hello from job");
});
`,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; name: string; cron: string; enabled: boolean; nextRunAt: string | null };
    expect(data.name).toBe("Daily ping");
    expect(data.cron).toBe("0 9 * * *");
    expect(data.enabled).toBe(true);
    expect(data.nextRunAt).toBeTruthy();
    jobId = data.id;
  });

  test("POST /api/jobs — invalid cron", async () => {
    const res = await authRequest(app, token, "POST", "/api/jobs", {
      name: "Bad",
      cron: "not-a-cron",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/jobs — multi-line cron stores normalized field", async () => {
    const res = await authRequest(app, token, "POST", "/api/jobs", {
      name: "Multi schedule",
      cron: "0 8 * * 1\n0 9 * * 2",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; cron: string; enabled: boolean; nextRunAt: string | null };
    expect(data.cron).toBe("0 8 * * 1\n0 9 * * 2");
    expect(data.enabled).toBe(true);
    expect(data.nextRunAt).toBeTruthy();

    await authRequest(app, token, "DELETE", `/api/jobs/${data.id}`);
  });

  test("PUT /api/jobs/:id — multi-line cron with one invalid rejects", async () => {
    const create = await authRequest(app, token, "POST", "/api/jobs", {
      name: "Temp multi",
      cron: "0 9 * * *",
    });
    const created = (await create.json()) as { id: string };
    const res = await authRequest(app, token, "PUT", `/api/jobs/${created.id}`, {
      cron: "0 8 * * 1\nnot-a-cron",
    });
    expect(res.status).toBe(400);
    await authRequest(app, token, "DELETE", `/api/jobs/${created.id}`);
  });

  test("GET /api/jobs — list", async () => {
    const res = await authRequest(app, token, "GET", "/api/jobs");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { id: string }[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.items.some((j) => j.id === jobId)).toBe(true);
  });

  test("GET /api/jobs/:id — get one", async () => {
    const res = await authRequest(app, token, "GET", `/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; code: string };
    expect(data.id).toBe(jobId);
    expect(data.code).toContain("hello from job");
  });

  test("PUT /api/jobs/:id — clear cron turns job off", async () => {
    const res = await authRequest(app, token, "PUT", `/api/jobs/${jobId}`, { cron: "" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { enabled: boolean; nextRunAt: string | null; cron: string };
    expect(data.cron).toBe("");
    expect(data.enabled).toBe(false);
    expect(data.nextRunAt).toBeNull();

    const on = await authRequest(app, token, "PUT", `/api/jobs/${jobId}`, { cron: "0 9 * * *" });
    expect(on.status).toBe(200);
    const enabled = (await on.json()) as { enabled: boolean; nextRunAt: string | null };
    expect(enabled.enabled).toBe(true);
    expect(enabled.nextRunAt).toBeTruthy();
  });

  test("POST /api/jobs/:id/run — manual run executes code", async () => {
    const res = await authRequest(app, token, "POST", `/api/jobs/${jobId}/run`, {});
    expect(res.status).toBe(202);
    const run = (await res.json()) as { id: string; status: string; trigger: string };
    expect(run.trigger).toBe("manual");
    expect(run.status).toBe("running");

    const done = await waitForRun(run.id);
    expect(done.status).toBe("success");
    const logs = typeof done.logs === "string" ? done.logs : JSON.stringify(done.logs);
    expect(logs).toContain("hello from job");
    expect(logs).toContain('"kind":"step"');
  });

  test("runDraftJobCode — starts job_run without waiting", async () => {
    const { updateDraftCode } = await import("../modules/jobs/jobs.service.js");
    const { runDraftJobCode } = await import("../modules/jobs/jobs-runner.js");

    updateDraftCode(
      jobId,
      `import nonlaagents from "nonlaagents";
await nonlaagents.step("draft", async () => {
  nonlaagents.log.info("from draft run");
});
`,
    );

    const result = runDraftJobCode(jobId);
    expect(result.started).toBe(true);
    expect(result.runId).toBeTruthy();

    const done = await waitForRun(result.runId!);
    expect(done.status).toBe("success");
    const stored = typeof done.logs === "string" ? done.logs : JSON.stringify(done.logs);
    expect(stored).toContain("from draft run");
  });

  test("POST /api/jobs/:id/run — overlap blocked while lease held", async () => {
    const claimed = tryClaimJob(jobId, "manual");
    expect(claimed).not.toBeNull();

    const res = await authRequest(app, token, "POST", `/api/jobs/${jobId}/run`, {});
    expect(res.status).toBe(400);

    finishJobRun({
      jobId,
      runId: claimed!.run.id,
      status: "success",
      logs: [{ t: 0, level: "info", message: "skipped" }],
      advanceSchedule: false,
    });
  });

  test("tryClaimJob — only one winner", () => {
    const a = tryClaimJob(jobId, "manual");
    expect(a).not.toBeNull();
    const b = tryClaimJob(jobId, "manual");
    expect(b).toBeNull();
    finishJobRun({
      jobId,
      runId: a!.run.id,
      status: "success",
      logs: [],
      advanceSchedule: false,
    });
  });

  test("GET /api/jobs/:id/runs — list runs", async () => {
    const res = await authRequest(app, token, "GET", `/api/jobs/${jobId}/runs`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { logs: { t: number; message: string }[] }[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.items[0]?.logs)).toBe(true);
  });

  test("manual run with nonlaagents kv", async () => {
    const update = await authRequest(app, token, "PUT", `/api/jobs/${jobId}`, {
      code: `import nonlaagents from "nonlaagents";
await nonlaagents.step("kv check", async () => {
  await nonlaagents.kv.set("JOB_TEST", "ok");
  const v = await nonlaagents.kv.get("JOB_TEST");
  nonlaagents.log.info("kv=" + v);
});
`,
    });
    expect(update.status).toBe(200);

    const res = await authRequest(app, token, "POST", `/api/jobs/${jobId}/run`, {});
    expect(res.status).toBe(202);
    const run = (await res.json()) as { id: string };
    const done = await waitForRun(run.id);
    expect(done.status).toBe("success");
    const logs = typeof done.logs === "string" ? done.logs : JSON.stringify(done.logs);
    expect(logs).toContain("kv=ok");
  });

  test("POST /api/jobs/:id/runs/:runId/cancel — stops running job", async () => {
    const create = await authRequest(app, token, "POST", "/api/jobs", {
      name: "Slow cancel",
      cron: "",
      code: "await Bun.sleep(60_000);",
    });
    expect(create.status).toBe(201);
    const slow = (await create.json()) as { id: string };

    const res = await authRequest(app, token, "POST", `/api/jobs/${slow.id}/run`, {});
    expect(res.status).toBe(202);
    const run = (await res.json()) as { id: string; status: string };
    expect(run.status).toBe("running");

    const cancel = await authRequest(app, token, "POST", `/api/jobs/${slow.id}/runs/${run.id}/cancel`, {});
    expect(cancel.status).toBe(200);

    const done = await waitForRun(run.id);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("Cancelled");

    await authRequest(app, token, "DELETE", `/api/jobs/${slow.id}`);
  });

  test("DELETE /api/jobs/:id", async () => {
    const res = await authRequest(app, token, "DELETE", `/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(getJob(jobId)).toBeUndefined();
  });
});
