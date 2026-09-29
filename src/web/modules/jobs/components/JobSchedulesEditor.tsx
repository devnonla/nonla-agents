import { Button, EFormItemType, SchemaForm, type TFormItemProps } from "devnonla-ui";
import { Plus, X } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { DEFAULT_JOB_SCHEDULE, INTERVAL_OPTIONS_MINUTES, type JobSchedule, type JobScheduleMode, WEEKDAYS, buildJobCron, formatJobScheduleLabel } from "../common/schedule";

const INTERVAL_CHOICES = INTERVAL_OPTIONS_MINUTES.map((m) => ({
  value: m,
  label: m < 60 ? `Every ${m} min` : m === 60 ? "Every hour" : `Every ${m / 60}h`,
}));

type ScheduleFormValues = {
  days: number[];
  mode: JobScheduleMode;
  time: string;
  intervalMinutes: number;
  useTimeWindow: boolean;
  fromTime: string;
  toTime: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function timeValue(hour: number, minute = 0) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTime(value: string | null | undefined, fallbackHour: number, fallbackMinute = 0) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return { hour: fallbackHour, minute: fallbackMinute };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function toForm(schedule: JobSchedule): ScheduleFormValues {
  return {
    days: schedule.days,
    mode: schedule.mode,
    time: timeValue(schedule.hour, schedule.minute),
    intervalMinutes: schedule.intervalMinutes,
    useTimeWindow: schedule.useTimeWindow,
    fromTime: timeValue(schedule.fromHour),
    toTime: timeValue(schedule.toHour),
  };
}

function fromForm(values: ScheduleFormValues, prev: JobSchedule): JobSchedule {
  const at = parseTime(values.time, prev.hour, prev.minute);
  const from = parseTime(values.fromTime, prev.fromHour);
  const to = parseTime(values.toTime, prev.toHour);
  return {
    days: Array.isArray(values.days) ? [...values.days].sort((a, b) => a - b) : [],
    mode: values.mode === "interval" ? "interval" : "once_daily",
    hour: at.hour,
    minute: at.minute,
    intervalMinutes: Number(values.intervalMinutes) || prev.intervalMinutes,
    useTimeWindow: Boolean(values.useTimeWindow),
    fromHour: from.hour,
    toHour: to.hour,
  };
}

function scheduleSummary(schedule: JobSchedule): string {
  const cron = buildJobCron(schedule);
  return cron ? formatJobScheduleLabel(cron) : "Select at least one day";
}

const SCHEDULE_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Custom,
    name: "days",
    label: "Days",
    colSpan: 12,
    rules: {
      validate: (value) => (Array.isArray(value) && value.length > 0 ? true : "Select at least one day"),
    },
    render: ({ field }) => {
      const days = Array.isArray(field.value) ? (field.value as number[]) : [];
      const toggle = (day: number) => {
        const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
        field.onChange(next);
      };
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAYS.map((d) => {
            const selected = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(d.value)}
                className={["h-7 min-w-8 cursor-pointer rounded-md border px-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none", selected ? "border-brand bg-brand text-white" : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"].join(" ")}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      );
    },
  },
  {
    type: EFormItemType.Radio,
    name: "mode",
    label: "Mode",
    colSpan: 12,
    choices: [
      { label: "At time", value: "once_daily" },
      { label: "Interval", value: "interval" },
    ],
  },
  {
    type: EFormItemType.Time,
    name: "time",
    label: "Run at",
    colSpan: 12,
    conditions: [[["mode", "==", "once_daily"]]],
    options: { format: "HH:mm", allowClear: false },
  },
  {
    type: EFormItemType.Select,
    name: "intervalMinutes",
    label: "Every",
    colSpan: 12,
    conditions: [[["mode", "==", "interval"]]],
    choices: INTERVAL_CHOICES,
    options: { allowClear: false },
  },
  {
    type: EFormItemType.Switch,
    name: "useTimeWindow",
    label: "Only between",
    colSpan: 12,
    conditions: [[["mode", "==", "interval"]]],
  },
  {
    type: EFormItemType.Time,
    name: "fromTime",
    label: "From",
    colSpan: 6,
    conditions: [
      [
        ["mode", "==", "interval"],
        ["useTimeWindow", "==", true],
      ],
    ],
    options: { format: "HH:mm", allowClear: false },
  },
  {
    type: EFormItemType.Time,
    name: "toTime",
    label: "To",
    colSpan: 6,
    conditions: [
      [
        ["mode", "==", "interval"],
        ["useTimeWindow", "==", true],
      ],
    ],
    options: { format: "HH:mm", allowClear: false },
  },
];

function newKey() {
  return crypto.randomUUID();
}

function ScheduleCard({ value, onChange, onRemove, index }: { value: JobSchedule; onChange: (next: JobSchedule) => void; onRemove: () => void; index: number }) {
  const form = useForm<ScheduleFormValues>({ defaultValues: toForm(value), mode: "onSubmit" });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-tertiary-foreground">Schedule {index + 1}</p>
          <p className="m-0 mt-0.5 truncate text-[13px] font-medium leading-snug text-foreground">{scheduleSummary(value)}</p>
        </div>
        <Button type="text" size="small" danger icon={<X size={14} />} onClick={onRemove} aria-label={`Remove schedule ${index + 1}`} />
      </div>
      <div className="px-3 py-3">
        <SchemaForm form={form} items={SCHEDULE_ITEMS} valuesChangeDebounce={0} onValuesChange={(values) => onChange(fromForm(values, value))} />
      </div>
    </div>
  );
}

export function JobSchedulesEditor({ value, onChange }: { value: JobSchedule[]; onChange: (next: JobSchedule[]) => void }) {
  const keysRef = useRef<string[]>([]);

  if (keysRef.current.length < value.length) {
    while (keysRef.current.length < value.length) keysRef.current.push(newKey());
  } else if (keysRef.current.length > value.length) {
    keysRef.current = keysRef.current.slice(0, value.length);
  }

  const updateAt = (index: number, next: JobSchedule) => {
    onChange(value.map((s, i) => (i === index ? next : s)));
  };

  const removeAt = (index: number) => {
    keysRef.current = keysRef.current.filter((_, i) => i !== index);
    onChange(value.filter((_, i) => i !== index));
  };

  const addSchedule = () => {
    keysRef.current = [...keysRef.current, newKey()];
    onChange([...value, { ...DEFAULT_JOB_SCHEDULE }]);
  };

  if (value.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-sm text-muted-foreground">No schedules — job is off. Add one to run on a cadence.</p>
        <Button className="self-start" size="small" color="primary" variant="filled" icon={<Plus size={14} />} onClick={addSchedule}>
          Add schedule
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {value.map((schedule, index) => (
        <ScheduleCard key={keysRef.current[index]} index={index} value={schedule} onChange={(next) => updateAt(index, next)} onRemove={() => removeAt(index)} />
      ))}
      <Button className="self-start" size="small" color="primary" variant="filled" icon={<Plus size={14} />} onClick={addSchedule}>
        Add schedule
      </Button>
    </div>
  );
}
