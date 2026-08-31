// ─── Date / time formatting utilities ──────────────────────────────────────────

import { isValid, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

type DateInput = Date | string | null | undefined;

/**
 * Display / picker format in app timezone — month as letters.
 * e.g. "23 Jul 2026 17:30"
 * Timezone itself is shown on the column header (hover), not per cell.
 */
export const DATETIME_DISPLAY_FORMAT = "dd MMM yyyy HH:mm";

/** Alias — same wall-clock format for DatePicker input. */
export const DATETIME_PICKER_FORMAT = DATETIME_DISPLAY_FORMAT;

/** Short offset label for a timezone at "now", e.g. "UTC+07:00". */
export function formatTimezoneOffsetLabel(timeZone = "UTC", at: Date = new Date()): string {
  const tz = timeZone.trim() || "UTC";
  try {
    const offset = formatInTimeZone(at, tz, "XXX"); // +07:00 | Z
    if (offset === "Z") return "UTC";
    return `UTC${offset}`;
  } catch {
    return "UTC";
  }
}

/** Human tooltip for a timezone: "Asia/Ho_Chi_Minh (UTC+07:00)". */
export function formatTimezoneTooltip(timeZone = "UTC", at: Date = new Date()): string {
  const tz = timeZone.trim() || "UTC";
  const offset = formatTimezoneOffsetLabel(tz, at);
  if (tz === "UTC" && offset === "UTC") return "Timezone: UTC";
  return `Timezone: ${tz} (${offset})`;
}

/** Parse any DateInput into a valid Date, or null */
function toDate(d: DateInput): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  if (typeof d === "string") {
    const iso = parseISO(d);
    if (isValid(iso)) return iso;
  }
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format an instant in the given IANA timezone.
 * Falls back to UTC when tz is empty/invalid-looking.
 */
export function formatDateTimeInTz(d: DateInput, timeZone = "UTC"): string {
  const date = toDate(d);
  if (!date) return "";
  const tz = timeZone.trim() || "UTC";
  try {
    return formatInTimeZone(date, tz, DATETIME_DISPLAY_FORMAT);
  } catch {
    return formatInTimeZone(date, "UTC", DATETIME_DISPLAY_FORMAT);
  }
}

/**
 * Build a Date whose *local* Y/M/D/H/M match the instant in `timeZone`.
 * Feed this to timezone-naive pickers (antd/date-fns) so the wall-clock
 * matches the app timezone rather than the browser's.
 */
export function toPickerDate(d: DateInput, timeZone = "UTC"): Date | null {
  const date = toDate(d);
  if (!date) return null;
  const tz = timeZone.trim() || "UTC";
  try {
    return toZonedTime(date, tz);
  } catch {
    return toZonedTime(date, "UTC");
  }
}

/**
 * Inverse of {@link toPickerDate}: treat the picker's local wall-clock as
 * belonging to `timeZone` and return the UTC ISO string to store.
 */
export function fromPickerDate(d: Date | null | undefined, timeZone = "UTC"): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const tz = timeZone.trim() || "UTC";
  try {
    return fromZonedTime(d, tz).toISOString();
  } catch {
    return fromZonedTime(d, "UTC").toISOString();
  }
}

/** Full date + time: "04/04/2026, 08:30" */
export function formatDateTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Time only: "08:30" */
export function formatTimeOnly(d: DateInput): string {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Human-readable day header: "Today", "Yesterday", or full weekday date */
export function formatDayHeader(d: DateInput): string {
  const date = toDate(d);
  if (!date) return "Unknown";

  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Unique date key for grouping: "2026-04-04" */
export function getDayKey(d: DateInput): string {
  const date = toDate(d);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Relative time description.
 * Past: "just now", "5m ago", "2h ago", "3d ago"
 * Future: "in 5m", "in 2h", "in 3d"
 */
export function relativeTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return "";

  const diffMs = Date.now() - date.getTime();

  if (diffMs < 0) {
    const mins = Math.floor(-diffMs / 60_000);
    if (mins < 1) return "soon";
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.floor(hrs / 24)}d`;
  }

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
