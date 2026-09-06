import { Segmented, Select, Switch } from "@nonla-agents/ui";
import { DEFAULT_JOB_SCHEDULE, INTERVAL_OPTIONS_MINUTES, type JobSchedule, WEEKDAYS, buildJobCron, formatJobScheduleLabel } from "../common/schedule";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: String(i).padStart(2, "0"),
}));

const HOUR_LABEL_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00`,
}));

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));

const INTERVAL_SELECT = INTERVAL_OPTIONS_MINUTES.map((m) => ({
  value: m,
  label: m < 60 ? `Every ${m} minutes` : m === 60 ? "Every hour" : `Every ${m / 60} hours`,
}));

function DayChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={["h-7 min-w-9 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none", selected ? "border-brand/50 bg-brand text-brand-foreground" : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"].join(" ")}
    >
      {label}
    </button>
  );
}

export function JobSchedulePicker({
  value,
  onChange,
}: {
  value: JobSchedule;
  onChange: (next: JobSchedule) => void;
}) {
  const patch = (partial: Partial<JobSchedule>) => onChange({ ...value, ...partial });

  const toggleDay = (day: number) => {
    const has = value.days.includes(day);
    patch({ days: has ? value.days.filter((d) => d !== day) : [...value.days, day].sort((a, b) => a - b) });
  };

  const setWeekdays = () => patch({ days: [1, 2, 3, 4, 5] });
  const setEveryday = () => patch({ days: [0, 1, 2, 3, 4, 5, 6] });

  const cron = buildJobCron(value);
  const summary = cron ? formatJobScheduleLabel(cron) : "Select at least one day";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Days</span>
          <div className="flex items-center gap-2 text-xs">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-brand-soft hover:underline focus-visible:outline-none" onClick={setWeekdays}>
              Weekdays
            </button>
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-brand-soft hover:underline focus-visible:outline-none" onClick={setEveryday}>
              Every day
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => (
            <DayChip key={d.value} label={d.label} selected={value.days.includes(d.value)} onToggle={() => toggleDay(d.value)} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-foreground">When</div>
        <Segmented
          size="small"
          block
          value={value.mode}
          onChange={(mode) => patch({ mode: mode as JobSchedule["mode"] })}
          options={[
            { label: "Specific time", value: "once_daily" },
            { label: "Interval", value: "interval" },
          ]}
        />
      </div>

      {value.mode === "once_daily" ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">At</span>
          <Select size="small" value={value.hour} options={HOUR_OPTIONS} onChange={(hour) => patch({ hour })} className="w-17" />
          <span className="text-xs text-muted-foreground">:</span>
          <Select size="small" value={value.minute} options={MINUTE_OPTIONS} onChange={(minute) => patch({ minute })} className="w-17" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Select size="small" value={value.intervalMinutes} options={INTERVAL_SELECT} onChange={(intervalMinutes) => patch({ intervalMinutes })} className="w-full max-w-xs" />
          <div className="flex items-center gap-2">
            <Switch size="small" checked={value.useTimeWindow} onChange={(useTimeWindow) => patch({ useTimeWindow })} />
            <span className="text-xs text-muted-foreground">Only between</span>
          </div>
          {value.useTimeWindow ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select size="small" value={value.fromHour} options={HOUR_LABEL_OPTIONS} onChange={(fromHour) => patch({ fromHour })} className="w-23" />
              <span className="text-xs text-muted-foreground">and</span>
              <Select size="small" value={value.toHour} options={HOUR_LABEL_OPTIONS} onChange={(toHour) => patch({ toHour })} className="w-23" />
            </div>
          ) : null}
        </div>
      )}

      <p className="m-0 text-xs text-muted-foreground">{summary}</p>
    </div>
  );
}

export { DEFAULT_JOB_SCHEDULE };
