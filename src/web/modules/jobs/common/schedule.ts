/** Job schedule ↔ 5-field cron (min hour dom month dow), Sunday=0. */

export const WEEKDAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
] as const;

export const INTERVAL_OPTIONS_MINUTES = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720] as const;

export type JobScheduleMode = "once_daily" | "interval";

export interface JobSchedule {
  days: number[];
  mode: JobScheduleMode;
  hour: number;
  minute: number;
  intervalMinutes: number;
  useTimeWindow: boolean;
  fromHour: number;
  toHour: number;
}

export const DEFAULT_JOB_SCHEDULE: JobSchedule = {
  days: [1, 2, 3, 4, 5],
  mode: "once_daily",
  hour: 9,
  minute: 0,
  intervalMinutes: 30,
  useTimeWindow: true,
  fromHour: 9,
  toHour: 17,
};

function formatDow(days: number[]): string {
  const unique = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (unique.length === 0) return "";
  if (unique.length === 7) return "*";
  return unique.join(",");
}

function parseDow(dow: string): number[] {
  if (dow === "*") return [0, 1, 2, 3, 4, 5, 6];
  if (dow.includes("-") && !dow.includes(",")) {
    const [a, b] = dow.split("-").map(Number);
    if (!Number.isNaN(a) && !Number.isNaN(b) && a <= b) {
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
  }
  return dow
    .split(",")
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

function hourField(s: JobSchedule): string {
  if (!s.useTimeWindow) {
    if (s.mode === "interval" && s.intervalMinutes >= 60) {
      const hours = s.intervalMinutes / 60;
      return hours === 1 ? "*" : `*/${hours}`;
    }
    return "*";
  }
  const from = Math.min(s.fromHour, s.toHour);
  const to = Math.max(s.fromHour, s.toHour);
  if (s.mode === "interval" && s.intervalMinutes >= 60) {
    const hours = s.intervalMinutes / 60;
    return hours === 1 ? `${from}-${to}` : `${from}-${to}/${hours}`;
  }
  return `${from}-${to}`;
}

export function buildJobCron(s: JobSchedule): string {
  const dow = formatDow(s.days);
  if (!dow) return "";

  if (s.mode === "once_daily") {
    const minute = Math.min(59, Math.max(0, Math.floor(s.minute)));
    const hour = Math.min(23, Math.max(0, Math.floor(s.hour)));
    return `${minute} ${hour} * * ${dow}`;
  }

  const interval = s.intervalMinutes;
  if (interval < 60) {
    return `*/${interval} ${hourField(s)} * * ${dow}`;
  }
  return `0 ${hourField(s)} * * ${dow}`;
}

export function parseJobCron(cron: string | null | undefined): JobSchedule {
  if (!cron?.trim()) return { ...DEFAULT_JOB_SCHEDULE };

  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return { ...DEFAULT_JOB_SCHEDULE };

  const [minute, hour, , , dow] = parts;
  const days = parseDow(dow);
  const base = { ...DEFAULT_JOB_SCHEDULE, days: days.length ? days : DEFAULT_JOB_SCHEDULE.days };

  // once daily: "M H * * dow"
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    return {
      ...base,
      mode: "once_daily",
      minute: Number(minute),
      hour: Number(hour),
    };
  }

  // interval
  let intervalMinutes = 30;
  const minuteStep = minute.match(/^\*\/(\d+)$/);
  if (minuteStep) {
    intervalMinutes = Number(minuteStep[1]);
  } else if (minute === "0") {
    const hourStep = hour.match(/^(?:\d+-\d+|\*)\/(\d+)$/) ?? hour.match(/^\*\/(\d+)$/);
    if (hourStep) intervalMinutes = Number(hourStep[1]) * 60;
    else if (hour === "*") intervalMinutes = 60;
    else if (/^\d+-\d+$/.test(hour)) intervalMinutes = 60;
    else intervalMinutes = 60;
  }

  let useTimeWindow = false;
  let fromHour = 9;
  let toHour = 17;
  const range = hour.match(/^(\d+)-(\d+)(?:\/\d+)?$/);
  if (range) {
    useTimeWindow = true;
    fromHour = Number(range[1]);
    toHour = Number(range[2]);
  }

  return {
    ...base,
    mode: "interval",
    intervalMinutes,
    useTimeWindow,
    fromHour,
    toHour,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatIntervalLabel(minutes: number): string {
  if (minutes < 60) return `every ${minutes} min`;
  const h = minutes / 60;
  return h === 1 ? "every hour" : `every ${h} hours`;
}

export function formatJobScheduleLabel(cron: string | null | undefined): string {
  const s = parseJobCron(cron);
  if (!s.days.length) return cron?.trim() || "—";

  const dayLabels = WEEKDAYS.filter((d) => s.days.includes(d.value)).map((d) => d.label);
  const daysText = dayLabels.length === 7 ? "Every day" : dayLabels.length === 5 && !s.days.includes(0) && !s.days.includes(6) ? "Weekdays" : dayLabels.join(", ");

  if (s.mode === "once_daily") {
    return `${daysText} at ${pad2(s.hour)}:${pad2(s.minute)}`;
  }

  const interval = formatIntervalLabel(s.intervalMinutes);
  if (s.useTimeWindow) {
    return `${daysText}, ${interval}, ${pad2(s.fromHour)}:00–${pad2(s.toHour)}:00`;
  }
  return `${daysText}, ${interval}`;
}

/** Split jobs.cron field (newline-separated) into individual expressions. */
export function parseJobCronExpressions(cronField: string | null | undefined): string[] {
  if (!cronField?.trim()) return [];
  return cronField
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseJobSchedules(cronField: string | null | undefined): JobSchedule[] {
  const expressions = parseJobCronExpressions(cronField);
  if (expressions.length === 0) return [];
  return expressions.map((expr) => parseJobCron(expr));
}

export function buildJobCrons(schedules: JobSchedule[]): string {
  return schedules
    .map((s) => buildJobCron(s))
    .filter(Boolean)
    .join("\n");
}

export function formatJobSchedulesLabel(cronField: string | null | undefined): string {
  const expressions = parseJobCronExpressions(cronField);
  if (expressions.length === 0) return "No schedule";
  return expressions.map((expr) => formatJobScheduleLabel(expr)).join(" · ");
}

export function jobIsScheduled(cronField: string | null | undefined): boolean {
  return parseJobCronExpressions(cronField).length > 0;
}

export function validateJobSchedule(s: JobSchedule): string | null {
  if (s.days.length === 0) return "Select at least one day";
  if (s.mode === "once_daily") {
    if (s.hour < 0 || s.hour > 23 || s.minute < 0 || s.minute > 59) return "Invalid time";
  } else {
    if (!INTERVAL_OPTIONS_MINUTES.includes(s.intervalMinutes as (typeof INTERVAL_OPTIONS_MINUTES)[number])) {
      return "Invalid interval";
    }
    if (s.useTimeWindow && (s.fromHour < 0 || s.fromHour > 23 || s.toHour < 0 || s.toHour > 23)) {
      return "Invalid time window";
    }
  }
  if (!buildJobCron(s)) return "Invalid schedule";
  return null;
}

export function validateJobSchedules(schedules: JobSchedule[]): string | null {
  if (schedules.length === 0) return null;
  for (let i = 0; i < schedules.length; i++) {
    const err = validateJobSchedule(schedules[i]);
    if (err) return schedules.length > 1 ? `Schedule ${i + 1}: ${err}` : err;
  }
  if (!buildJobCrons(schedules)) return "Invalid schedule";
  return null;
}
