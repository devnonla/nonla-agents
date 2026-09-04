import { Popover } from "@nonla-agents/ui";
import { AlarmIcon } from "@solar-icons/react/dynamic/alarm";
import { ClockCircleIcon } from "@solar-icons/react/dynamic/clock-circle";
import { cn } from "src/common/lib/cn";
import type { Job } from "src/common/types";
import { formatDateTime, relativeTime } from "src/common/utils/date";
import RenderIf from "src/components/RenderIf";
import { formatJobScheduleLabel, jobIsScheduled, parseJobCronExpressions } from "../common/schedule";

function nextRunMeta(nextRunAt: Date | string, now: number): { eta: string; imminent: boolean } | null {
  const at = nextRunAt instanceof Date ? nextRunAt : new Date(nextRunAt);
  if (Number.isNaN(at.getTime())) return null;
  const diffMs = at.getTime() - now;
  if (diffMs <= 0) return null;
  const imminent = diffMs < 120_000;
  if (imminent) return { eta: `${Math.max(1, Math.ceil(diffMs / 1000))}s`, imminent };
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return { eta: `${mins}m`, imminent };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { eta: `${hrs}h`, imminent };
  return { eta: `${Math.floor(hrs / 24)}d`, imminent };
}

export function JobCard({
  job,
  now = Date.now(),
  onOpen,
}: {
  job: Job;
  now?: number;
  onOpen: () => void;
}) {
  const scheduled = jobIsScheduled(job.cron);
  const scheduleLabels = parseJobCronExpressions(job.cron).map((expr) => formatJobScheduleLabel(expr));
  const next = job.nextRunAt && scheduled ? nextRunMeta(job.nextRunAt, now) : null;
  const lastLabel = job.lastRunAt ? relativeTime(job.lastRunAt) : null;

  return (
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
      className={cn("group relative flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border-subtle bg-card px-3 py-3 text-left", "transition-[border-color,background-color] duration-200", "hover:border-brand/30 hover:bg-secondary", !scheduled && "opacity-80 hover:opacity-100")}
    >
      <div className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle", scheduled ? "bg-brand/12 text-brand-soft" : "bg-muted text-muted-foreground")}>
        <AlarmIcon size={20} weight="BoldDuotone" />
      </div>

      <div className="relative min-w-0 flex-1">
        <h2 className="m-0 truncate text-base font-semibold leading-6 text-foreground">{job.name}</h2>
      </div>

      <div className="relative flex shrink-0 flex-col items-end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <RenderIf condition={!scheduled}>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-subtle px-2 py-1 text-[11px] text-muted-foreground">No schedule</span>
        </RenderIf>
        <RenderIf condition={!!next}>
          <Popover
            trigger="hover"
            placement="bottomRight"
            mouseEnterDelay={0.15}
            mouseLeaveDelay={0.35}
            arrow={false}
            content={
              <div className="min-w-55 max-w-75 space-y-3 py-0.5" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <div>
                  <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{scheduleLabels.length > 1 ? `Schedules (${scheduleLabels.length})` : "Schedule"}</p>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {scheduleLabels.map((label, i) => (
                      <li key={`${i}-${label}`} className={cn("rounded-md px-2 py-1.5 text-[12px] leading-snug text-foreground", scheduleLabels.length > 1 ? "border border-border-subtle bg-muted/40" : "px-0 py-0")}>
                        <RenderIf condition={scheduleLabels.length > 1}>
                          <span className="mb-0.5 block text-[10px] font-semibold tabular-nums text-muted-foreground">#{i + 1}</span>
                        </RenderIf>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-border-subtle pt-2.5">
                  <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next run</p>
                  <p className="m-0 text-[13px] font-medium tabular-nums text-foreground">{formatDateTime(job.nextRunAt)}</p>
                  <p className="mt-0.5 mb-0 text-[11px] tabular-nums text-muted-foreground">in {next?.eta}</p>
                </div>
              </div>
            }
          >
            <span
              className={cn(
                "inline-flex cursor-default items-center gap-1.5 rounded-md border px-2 py-1",
                "bg-muted/60 font-mono text-[12px] tabular-nums leading-none",
                "transition-[border-color,background-color] duration-200",
                next?.imminent ? "border-brand/40 bg-brand/12 text-brand-soft" : "border-border-subtle text-foreground group-hover:border-brand/25",
              )}
            >
              <ClockCircleIcon size={13} weight="BoldDuotone" className="shrink-0 opacity-80" />
              <span className="text-[9px] font-bold tracking-[0.14em] text-muted-foreground">NEXT</span>
              <span className="font-semibold tracking-tight">{next?.eta}</span>
            </span>
          </Popover>
        </RenderIf>
        <RenderIf condition={scheduled && !next && !!lastLabel}>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-muted/40 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">Last {lastLabel}</span>
        </RenderIf>
        <RenderIf condition={scheduled && !next && !lastLabel}>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-subtle px-2 py-1 text-[11px] text-muted-foreground">Waiting</span>
        </RenderIf>
      </div>
    </div>
  );
}
