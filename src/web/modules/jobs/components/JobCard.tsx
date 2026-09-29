import { Popover, Tag } from "devnonla-ui";
import { useMemo } from "react";
import { cn } from "src/common/lib/cn";
import type { Job } from "src/common/types";
import { formatDateTime, relativeTime } from "src/common/utils/date";
import { FluentIcon } from "src/components/FluentIcon";
import RenderIf from "src/components/RenderIf";
import { formatJobScheduleLabel, jobIsScheduled, parseJobCronExpressions } from "../common/schedule";

export type JobListStatus = "running" | "scheduled" | "idle";

export function jobListStatus(job: Job, now: number): JobListStatus {
  if (job.leaseUntil != null && new Date(job.leaseUntil).getTime() > now) return "running";
  if (jobIsScheduled(job.cron)) return "scheduled";
  return "idle";
}

export const JOB_STATUS_META: Record<JobListStatus, { label: string; description: string; icon: string }> = {
  running: {
    label: "Running",
    description: "This job is executing now.",
    icon: "play-24",
  },
  scheduled: {
    label: "Scheduled",
    description: "Runs automatically on its schedule.",
    icon: "calendar-clock-24",
  },
  idle: {
    label: "Off",
    description: "No schedule set. This job stays idle until a schedule is added.",
    icon: "calendar-cancel-24",
  },
};

const TREE_STROKE = "text-muted-foreground/40";
const TREE_LINE_FILL = "bg-muted-foreground/40";

function formatCountdown(diffMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(diffMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function nextRunMeta(nextRunAt: Date | string, now: number): { countdown: string; imminent: boolean } | null {
  const at = nextRunAt instanceof Date ? nextRunAt : new Date(nextRunAt);
  if (Number.isNaN(at.getTime())) return null;
  const diffMs = at.getTime() - now;
  if (diffMs <= 0) return null;
  const imminent = diffMs < 120_000;
  return { countdown: formatCountdown(diffMs), imminent };
}

function nextRunLabel(job: Job, now: number): string {
  const status = jobListStatus(job, now);
  if (status === "running") return "Running";
  if (!jobIsScheduled(job.cron)) return "No schedule";
  const next = job.nextRunAt ? nextRunMeta(job.nextRunAt, now) : null;
  if (!next) return "Waiting";
  return `in ${next.countdown}`;
}

const META_TEXT = "text-[12px] tabular-nums leading-none";

function NextRunValue({ job, now }: { job: Job; now: number }) {
  const status = jobListStatus(job, now);
  const scheduled = jobIsScheduled(job.cron);
  const scheduleLabels = parseJobCronExpressions(job.cron).map((expr) => formatJobScheduleLabel(expr));
  const next = job.nextRunAt && scheduled ? nextRunMeta(job.nextRunAt, now) : null;
  const label = nextRunLabel(job, now);
  const tag = (
    <Tag color={status === "running" ? "success" : undefined} className={cn("m-0! max-w-full shrink-0 rounded-md font-normal! ring-1 ring-inset ring-foreground/10", status !== "running" && "bg-white/80!", META_TEXT, status === "idle" && "text-muted-foreground")}>
      {label}
    </Tag>
  );

  if (!scheduled || !next || !job.nextRunAt) {
    return tag;
  }

  return (
    <Popover
      trigger="hover"
      placement="bottomRight"
      mouseEnterDelay={0.15}
      mouseLeaveDelay={0.35}
      arrow={false}
      content={
        <div className="min-w-55 max-w-75 space-y-3 py-0.5">
          <div>
            <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{scheduleLabels.length > 1 ? `Schedules (${scheduleLabels.length})` : "Schedule"}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {scheduleLabels.map((item, i) => (
                <li key={`${i}-${item}`} className={cn("rounded-md px-2 py-1.5 text-[12px] leading-snug text-foreground", scheduleLabels.length > 1 ? "border border-border-subtle bg-muted/40" : "px-0 py-0")}>
                  <RenderIf condition={scheduleLabels.length > 1}>
                    <span className="mb-0.5 block text-[10px] font-semibold tabular-nums text-muted-foreground">#{i + 1}</span>
                  </RenderIf>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border-subtle pt-2.5">
            <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next run</p>
            <p className="m-0 text-[13px] font-medium tabular-nums text-foreground">{formatDateTime(job.nextRunAt)}</p>
            <p className="mt-0.5 mb-0 text-[11px] tabular-nums text-muted-foreground">in {next.countdown}</p>
          </div>
        </div>
      }
    >
      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {tag}
      </span>
    </Popover>
  );
}

function TreeGuide({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("pointer-events-none relative w-8 shrink-0 self-stretch", TREE_STROKE)} aria-hidden>
      <RenderIf
        condition={isLast}
        fallback={
          <>
            <div className={cn("absolute left-1/2 -top-px -bottom-px w-px -translate-x-1/2", TREE_LINE_FILL)} />
            <div className={cn("absolute left-1/2 top-1/2 h-px w-4 -translate-y-1/2", TREE_LINE_FILL)} />
          </>
        }
      >
        <div className={cn("absolute left-1/2 top-0 w-px -translate-x-1/2", TREE_LINE_FILL, "h-[calc(50%-7px)]")} />
        <svg className="absolute left-[calc(50%-0.5px)] top-[calc(50%-7px)] overflow-visible" width="17" height="8" viewBox="0 0 17 8" fill="none">
          <path d="M0.5 0 V1.5 Q0.5 7.5 8 7.5 H17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </RenderIf>
    </div>
  );
}

function JobRow({ job, now, isLast, muted, onOpen }: { job: Job; now: number; isLast: boolean; muted: boolean; onOpen: () => void }) {
  const status = jobListStatus(job, now);
  const lastLabel = job.lastRunAt ? relativeTime(job.lastRunAt) : "Never";

  return (
    <div className="relative flex items-stretch">
      <TreeGuide isLast={isLast} />
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${job.name}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="group/job flex min-w-0 flex-1 cursor-pointer items-center rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/60"
      >
        <span className={cn("flex min-w-0 flex-1 items-center gap-2", muted ? "text-muted-foreground" : "text-foreground")}>
          <RenderIf condition={status === "running"}>
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-success" aria-hidden />
          </RenderIf>
          <span className="min-w-0 truncate text-[13px] font-medium leading-snug">{job.name}</span>
        </span>
        <span className="flex w-36 shrink-0 justify-end">
          <NextRunValue job={job} now={now} />
        </span>
        <span className={cn("flex w-20 shrink-0 items-center justify-end text-muted-foreground", META_TEXT)}>{lastLabel}</span>
      </div>
    </div>
  );
}

function sortByNextRun(jobs: Job[], now: number): Job[] {
  return [...jobs].sort((a, b) => {
    const aRunning = jobListStatus(a, now) === "running";
    const bRunning = jobListStatus(b, now) === "running";
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    const aNext = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
    const bNext = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
    if (aNext !== bNext) return aNext - bNext;
    return a.name.localeCompare(b.name);
  });
}

function JobGroup({ status, jobs, now, onOpen }: { status: "scheduled" | "idle"; jobs: Job[]; now: number; onOpen: (job: Job) => void }) {
  const meta = JOB_STATUS_META[status];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center py-1.5">
        <div className="flex w-8 shrink-0 items-center justify-center">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-white/70 ring-1 ring-inset ring-foreground/10", status === "idle" ? "text-muted-foreground" : "text-foreground/80")}>
            <FluentIcon name={meta.icon} size={15} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center px-2">
          <span className="shrink-0 text-[15px] font-semibold tracking-tight text-foreground">{meta.label}</span>
          <span className="ml-2.5 shrink-0 text-[11px] tabular-nums text-muted-foreground">{jobs.length}</span>
          <span className="min-w-0 flex-1" />
          <span className="w-36 shrink-0 text-right text-[11px] text-muted-foreground">Next</span>
          <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">Last</span>
        </div>
      </div>

      <div className="relative">
        <div className={cn("absolute left-4 top-0 h-2.5 w-px -translate-x-1/2", TREE_LINE_FILL)} aria-hidden />
        <div className="flex flex-col pt-1">
          {jobs.map((job, index) => (
            <JobRow key={job.id} job={job} now={now} isLast={index === jobs.length - 1} muted={status === "idle"} onOpen={() => onOpen(job)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function JobsTree({ jobs, now, onOpen }: { jobs: Job[]; now: number; onOpen: (job: Job) => void }) {
  const groups = useMemo(() => {
    const scheduled: Job[] = [];
    const idle: Job[] = [];
    for (const job of jobs) {
      if (jobListStatus(job, now) === "idle") idle.push(job);
      else scheduled.push(job);
    }
    return [
      { status: "scheduled" as const, jobs: sortByNextRun(scheduled, now) },
      { status: "idle" as const, jobs: [...idle].sort((a, b) => a.name.localeCompare(b.name)) },
    ].filter((group) => group.jobs.length > 0);
  }, [jobs, now]);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <JobGroup key={group.status} status={group.status} jobs={group.jobs} now={now} onOpen={onOpen} />
      ))}
    </div>
  );
}
