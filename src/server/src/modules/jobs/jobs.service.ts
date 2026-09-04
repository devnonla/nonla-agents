import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { type Job, type JobRun, type JobRunTrigger, type NewJob, type NewJobRun, getDb, jobRuns, jobs } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { qall, qone, qrun } from "../../common/db/query.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { cronNextDateMulti, parseJobCrons } from "../../common/utils/cronHelper.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { type JobLogEntry, parseJobLogs, serializeJobLogs } from "./common/job-logs.js";
import { getInstanceId, wakeScheduler } from "./jobs-events.js";

export type { JobLogEntry };
export type PublicJobRun = Omit<JobRun, "logs"> & { logs: JobLogEntry[] };

export function toPublicJobRun(run: JobRun): PublicJobRun {
  return { ...run, logs: parseJobLogs(run.logs) };
}

function asDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** For API/WS: always surface a future nextRunAt when the job has a schedule. */
export function toPublicJob(job: Job): Job {
  if (!job.enabled || parseJobCrons(job.cron).length === 0) return job;
  const current = asDate(job.nextRunAt);
  const now = Date.now();
  if (current && current.getTime() > now) {
    return current === job.nextRunAt ? job : { ...job, nextRunAt: current };
  }
  const next = cronNextDateMulti(job.cron, new Date(now));
  if (!next || next.getTime() <= now) return job;
  return { ...job, nextRunAt: next };
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_CODE = `import nonlaagents from "@nonla-agents/runtime";

await nonlaagents.step("Main", async () => {
  nonlaagents.log.info("Job started");
});
`;

function normalizeCronField(cron: string): string {
  return parseJobCrons(cron).join("\n");
}

/** Empty cron = off. Non-empty must be valid; returns next run or null when off. */
function resolveSchedule(cron: string): { enabled: boolean; nextRunAt: Date | null } {
  const expressions = parseJobCrons(cron);
  if (expressions.length === 0) {
    return { enabled: false, nextRunAt: null };
  }
  const next = cronNextDateMulti(expressions.join("\n"), new Date());
  if (!next) throw new BadRequestException("Invalid cron expression (5-field: min hour dom month dow)");
  return { enabled: true, nextRunAt: next };
}

export async function listJobs(query?: RawQuery) {
  const result = await listQuery({ table: jobs, searchColumns: ["name", "description"] }, query);
  return { ...result, items: result.items.map(toPublicJob) };
}

export async function getJob(id: string): Promise<Job | undefined> {
  return await qone(getDb().select().from(jobs).where(eq(jobs.id, id)));
}

export async function createJob(body: {
  name?: string;
  description?: string | null;
  code?: string;
  cron?: string;
  timeoutMs?: number;
}) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new BadRequestException("Name is required");
  const cron = normalizeCronField(String(body.cron ?? ""));
  const { enabled, nextRunAt } = resolveSchedule(cron);

  const timeoutMs = typeof body.timeoutMs === "number" && body.timeoutMs > 0 ? Math.floor(body.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const now = new Date();

  const entry: NewJob = {
    id: crypto.randomUUID(),
    name,
    description: body.description?.trim() || null,
    code: typeof body.code === "string" ? body.code : DEFAULT_CODE,
    cron,
    enabled,
    timeoutMs,
    nextRunAt,
    lastRunAt: null,
    leaseOwner: null,
    leaseUntil: null,
    createdAt: now,
    updatedAt: now,
  };

  await qrun(getDb().insert(jobs).values(entry));
  const created = toPublicJob((await getJob(entry.id as string))!);
  wsHub.emit("jobs:created", created);
  wakeScheduler();
  return created;
}

export async function updateJob(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    code?: string;
    cron?: string;
    timeoutMs?: number;
  },
) {
  const existing = await getJob(id);
  if (!existing) throw new BadRequestException("Job not found");

  const now = new Date();
  const patch: Partial<Job> = { updatedAt: now };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new BadRequestException("Name is required");
    patch.name = name;
  }
  if (body.description !== undefined) {
    patch.description = body.description?.trim() || null;
  }
  if (typeof body.code === "string") {
    patch.code = body.code;
    patch.draftCode = body.code;
  }
  if (body.timeoutMs !== undefined) {
    if (typeof body.timeoutMs !== "number" || body.timeoutMs <= 0) {
      throw new BadRequestException("timeoutMs must be a positive number");
    }
    patch.timeoutMs = Math.floor(body.timeoutMs);
  }

  let cron = existing.cron;
  if (body.cron !== undefined) {
    cron = normalizeCronField(String(body.cron));
    patch.cron = cron;
  }

  const schedule = resolveSchedule(cron);
  const cronChanged = body.cron !== undefined && cron !== existing.cron;
  if (cronChanged || schedule.enabled !== existing.enabled || (schedule.enabled && !existing.nextRunAt)) {
    patch.enabled = schedule.enabled;
    patch.nextRunAt = schedule.nextRunAt;
    if (!schedule.enabled) {
      patch.leaseOwner = null;
      patch.leaseUntil = null;
    }
  }

  await qrun(getDb().update(jobs).set(patch).where(eq(jobs.id, id)));
  const updated = toPublicJob((await getJob(id))!);
  wsHub.emit("jobs:updated", updated);
  wakeScheduler();
  return updated;
}

export async function deleteJob(id: string) {
  const existing = await getJob(id);
  if (!existing) throw new BadRequestException("Job not found");
  await qrun(getDb().delete(jobs).where(eq(jobs.id, id)));
  wsHub.emit("jobs:deleted", { id });
  wakeScheduler();
}

export async function listJobRuns(jobId: string, query?: RawQuery) {
  const job = await getJob(jobId);
  if (!job) throw new BadRequestException("Job not found");

  const page = Math.max(1, Number(query?.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query?.limit ?? 20) || 20));
  const offset = (page - 1) * limit;

  const db = getDb();
  const rows = await qall(db.select().from(jobRuns).where(eq(jobRuns.jobId, jobId)).orderBy(desc(jobRuns.startedAt)).limit(limit).offset(offset));
  const totalRow = await qone(db.select({ count: sql<number>`count(*)` }).from(jobRuns).where(eq(jobRuns.jobId, jobId)));
  const total = Number(totalRow?.count ?? 0);

  return { items: rows.map(toPublicJobRun), total, page, limit };
}

export async function getJobRun(runId: string): Promise<JobRun | undefined> {
  return await qone(getDb().select().from(jobRuns).where(eq(jobRuns.id, runId)));
}

/** Recalculate next_run_at for all enabled jobs (e.g. timezone change). */
export async function recalculateAllJobSchedules() {
  const db = getDb();
  const enabledJobs = await qall(db.select().from(jobs).where(eq(jobs.enabled, true)));
  const now = new Date();
  for (const job of enabledJobs) {
    const next = cronNextDateMulti(job.cron, now);
    await qrun(db.update(jobs).set({ nextRunAt: next, updatedAt: now }).where(eq(jobs.id, job.id)));
  }
  wakeScheduler();
}

export async function listDueJobs(now: Date = new Date()): Promise<Job[]> {
  return await qall(
    getDb()
      .select()
      .from(jobs)
      .where(and(eq(jobs.enabled, true), lte(jobs.nextRunAt, now), or(isNull(jobs.leaseUntil), lte(jobs.leaseUntil, now)))),
  );
}

export async function getMinNextRunAt(): Promise<Date | null> {
  const row = await qone(
    getDb()
      .select({ nextRunAt: jobs.nextRunAt })
      .from(jobs)
      .where(and(eq(jobs.enabled, true), sql`${jobs.nextRunAt} IS NOT NULL`))
      .orderBy(asc(jobs.nextRunAt))
      .limit(1),
  );
  return row?.nextRunAt ?? null;
}

async function hasActiveRun(jobId: string): Promise<boolean> {
  const row = await qone(
    getDb()
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, "running"))),
  );
  return !!row;
}

/**
 * Atomically claim a due job for this instance.
 * Returns job_run id if won, null if lost / overlap.
 */
export async function tryClaimJob(jobId: string, trigger: JobRunTrigger = "cron"): Promise<{ job: Job; run: PublicJobRun } | null> {
  const db = getDb();
  const now = new Date();
  const instanceId = getInstanceId();

  const job = await getJob(jobId);
  if (!job) return null;
  if (!job.enabled && trigger === "cron") return null;
  if (await hasActiveRun(jobId)) return null;

  const leaseUntil = new Date(now.getTime() + job.timeoutMs + 60_000);

  if (trigger === "cron") {
    if (!job.nextRunAt || job.nextRunAt.getTime() > now.getTime()) return null;
    if (job.leaseUntil && job.leaseUntil.getTime() > now.getTime()) return null;
  } else if (job.leaseUntil && job.leaseUntil.getTime() > now.getTime()) {
    return null;
  }

  const claimWhere = trigger === "cron" ? and(eq(jobs.id, jobId), eq(jobs.enabled, true), lte(jobs.nextRunAt, now), or(isNull(jobs.leaseUntil), lte(jobs.leaseUntil, now))) : and(eq(jobs.id, jobId), or(isNull(jobs.leaseUntil), lte(jobs.leaseUntil, now)));

  const nextAfterClaim = trigger === "cron" && job.enabled ? cronNextDateMulti(job.cron, now) : undefined;

  const updated = await qall(
    db
      .update(jobs)
      .set({
        leaseOwner: instanceId,
        leaseUntil,
        ...(nextAfterClaim && nextAfterClaim.getTime() > now.getTime() ? { nextRunAt: nextAfterClaim } : {}),
        updatedAt: now,
      })
      .where(claimWhere)
      .returning({ id: jobs.id }),
  );

  if (updated.length === 0) return null;

  const runId = crypto.randomUUID();
  const run: NewJobRun = {
    id: runId,
    jobId,
    status: "running",
    trigger,
    logs: "[]",
    error: null,
    instanceId,
    startedAt: now,
    finishedAt: null,
  };
  await qrun(db.insert(jobRuns).values(run));

  const claimed = toPublicJob((await getJob(jobId))!);
  const createdRun = (await getJobRun(runId))!;
  const publicRun = toPublicJobRun(createdRun);
  wsHub.emit("jobs:updated", claimed);
  wsHub.emit("job_runs:created", publicRun);
  return { job: claimed, run: publicRun };
}

export async function finishJobRun(opts: {
  jobId: string;
  runId: string;
  status: "success" | "failed";
  logs?: JobLogEntry[] | string;
  error?: string | null;
  advanceSchedule: boolean;
}) {
  const db = getDb();
  const now = new Date();
  const job = await getJob(opts.jobId);
  const existing = await getJobRun(opts.runId);
  const baseEntries = opts.logs !== undefined ? (typeof opts.logs === "string" ? parseJobLogs(opts.logs) : opts.logs) : parseJobLogs(existing?.logs);
  const startedMs = existing?.startedAt ? new Date(existing.startedAt).getTime() : now.getTime();
  const t = Math.max(0, now.getTime() - startedMs);
  const entries = [...baseEntries];
  if (opts.error) {
    entries.push({ t, level: "error", message: opts.error, kind: "system" });
  } else if (opts.status === "success") {
    entries.push({ t, level: "system", message: "Completed successfully", kind: "system" });
  }

  await qrun(
    db
      .update(jobRuns)
      .set({
        status: opts.status,
        logs: serializeJobLogs(entries),
        error: opts.error ?? null,
        finishedAt: now,
      })
      .where(eq(jobRuns.id, opts.runId)),
  );

  let nextRunAt = asDate(job?.nextRunAt);
  if (job?.enabled && parseJobCrons(job.cron).length > 0) {
    const shouldAdvance = opts.advanceSchedule || !nextRunAt || nextRunAt.getTime() <= now.getTime();
    if (shouldAdvance) {
      nextRunAt = cronNextDateMulti(job.cron, now);
    }
  } else if (!job?.enabled) {
    nextRunAt = null;
  }

  await qrun(
    db
      .update(jobs)
      .set({
        leaseOwner: null,
        leaseUntil: null,
        lastRunAt: now,
        nextRunAt: nextRunAt ?? null,
        updatedAt: now,
      })
      .where(eq(jobs.id, opts.jobId)),
  );

  const updatedJob = await getJob(opts.jobId);
  const updatedRun = await getJobRun(opts.runId);
  if (updatedJob) wsHub.emit("jobs:updated", toPublicJob(updatedJob));
  if (updatedRun) wsHub.emit("job_runs:updated", toPublicJobRun(updatedRun));
  wakeScheduler();
}

/** Mark orphaned running runs as failed when lease expired or missing. */
export async function healOrphanedRuns(now: Date = new Date()) {
  const db = getDb();
  const staleJobs = await qall(
    db
      .select()
      .from(jobs)
      .where(and(sql`${jobs.leaseOwner} IS NOT NULL`, lte(jobs.leaseUntil, now))),
  );

  for (const job of staleJobs) {
    const running = await qall(
      db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.jobId, job.id), eq(jobRuns.status, "running"))),
    );
    for (const run of running) {
      await qrun(
        db
          .update(jobRuns)
          .set({
            status: "failed",
            error: "Run orphaned: lease expired (instance may have crashed)",
            finishedAt: now,
          })
          .where(eq(jobRuns.id, run.id)),
      );
      const orphan = await getJobRun(run.id);
      if (orphan) wsHub.emit("job_runs:updated", toPublicJobRun(orphan));
    }
    await qrun(db.update(jobs).set({ leaseOwner: null, leaseUntil: null, updatedAt: now }).where(eq(jobs.id, job.id)));
  }

  const stuckRuns = await qall(db.select().from(jobRuns).where(eq(jobRuns.status, "running")));
  for (const run of stuckRuns) {
    const job = await getJob(run.jobId);
    if (!job) continue;
    const leaseUntil = asDate(job.leaseUntil);
    if (leaseUntil && leaseUntil.getTime() > now.getTime()) continue;
    await qrun(
      db
        .update(jobRuns)
        .set({
          status: "failed",
          error: "Run orphaned: no active lease",
          finishedAt: now,
        })
        .where(eq(jobRuns.id, run.id)),
    );
    await qrun(db.update(jobs).set({ leaseOwner: null, leaseUntil: null, updatedAt: now }).where(eq(jobs.id, job.id)));
    const orphan = await getJobRun(run.id);
    if (orphan) wsHub.emit("job_runs:updated", toPublicJobRun(orphan));
    if (job.enabled) wsHub.emit("jobs:updated", toPublicJob((await getJob(job.id))!));
  }
}

export async function updateDraftCode(id: string, draftCode: string): Promise<void> {
  await qrun(getDb().update(jobs).set({ draftCode, updatedAt: new Date() }).where(eq(jobs.id, id)));
  wsHub.emit("jobs:updated", { id, draftCode });
}

export async function getDraftCode(id: string): Promise<string | null> {
  const row = await qone(getDb().select({ draftCode: jobs.draftCode, code: jobs.code }).from(jobs).where(eq(jobs.id, id)));
  if (!row) return null;
  return row.draftCode ?? row.code ?? null;
}

/** Append structured log entries while run is in progress; emit WS for live UI. */
export async function appendRunLogEntries(runId: string, entries: JobLogEntry[]) {
  if (!entries.length) return;
  const run = await getJobRun(runId);
  if (!run || run.status !== "running") return;
  const next = [...parseJobLogs(run.logs), ...entries];
  const logs = serializeJobLogs(next);
  await qrun(getDb().update(jobRuns).set({ logs }).where(eq(jobRuns.id, runId)));
  wsHub.emit("job_runs:log", { id: runId, jobId: run.jobId, entries, logs: parseJobLogs(logs) });
}

export { DEFAULT_CODE, DEFAULT_TIMEOUT_MS };
