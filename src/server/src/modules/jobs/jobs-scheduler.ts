import { getInstanceId, sleepInterruptible, wakeScheduler } from "./jobs-events.js";
import { startClaimedRun } from "./jobs-runner.js";
import { getMinNextRunAt, healOrphanedRuns, listDueJobs, tryClaimJob } from "./jobs.service.js";

const MAX_SLEEP_MS = 60_000;

let running = false;

export { getInstanceId, wakeScheduler } from "./jobs-events.js";

async function tickOnce() {
  const now = new Date();
  healOrphanedRuns(now);

  const due = listDueJobs(now);
  for (const job of due) {
    const claimed = tryClaimJob(job.id, "cron");
    if (!claimed) continue;
    startClaimedRun(claimed.job.id, claimed.run.id, true);
  }
}

async function loop() {
  while (running) {
    try {
      await tickOnce();
    } catch (err) {
      console.error("[jobs-scheduler]", err);
    }

    const now = Date.now();
    const next = getMinNextRunAt();
    let sleepMs = MAX_SLEEP_MS;
    if (next) {
      sleepMs = Math.min(MAX_SLEEP_MS, Math.max(0, next.getTime() - now));
    }
    await sleepInterruptible(sleepMs);
  }
}

export function startJobsScheduler() {
  if (process.env.ENABLE_SCHEDULER === "false") {
    console.info("[jobs-scheduler] disabled (ENABLE_SCHEDULER=false)");
    return;
  }
  if (running) return;
  running = true;
  console.info(`[jobs-scheduler] started instance=${getInstanceId()}`);
  void loop();
}

export function stopJobsScheduler() {
  running = false;
  wakeScheduler();
}

/** Test helper: run one scheduler tick. */
export async function _tickJobsSchedulerForTest() {
  await tickOnce();
}
