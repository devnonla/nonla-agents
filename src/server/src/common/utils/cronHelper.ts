/**
 * cronHelper - Timezone-aware cron next-date calculation.
 *
 * Bun.cron.parse() operates entirely in UTC.
 * Cron "9-18" means 9h-18h UTC, NOT local time.
 *
 * To support user-defined timezones (e.g. Asia/Ho_Chi_Minh UTC+7):
 *   1. Shift `from` forward by TZ offset so Bun reads local hours as UTC
 *   2. Bun.cron.parse() computes next slot
 *   3. Shift result back to get real UTC timestamp
 */

import { eq } from "drizzle-orm";
import { appSettings, getDb } from "../db/client.js";

/** Đọc timezone đã cấu hình từ DB. Fallback: UTC. */
export function getConfiguredTimezone(): string {
  try {
    const row = getDb().select().from(appSettings).where(eq(appSettings.key, "timezone")).get();
    if (row?.value) return row.value;
  } catch {
    /* ignore */
  }
  return "UTC";
}

/**
 * Tính TZ offset (ms) của một timezone tại một thời điểm cụ thể.
 * Dùng native Intl API — không cần thư viện ngoài.
 * DST-safe: tính offset tại `date` chứ không phải cố định.
 *
 * Ví dụ: "Asia/Ho_Chi_Minh" → +25200000 (+7h)
 */
export function getTzOffsetMs(tz: string, date: Date): number {
  try {
    const fmt = (timeZone: string) =>
      date.toLocaleString("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    const utcDate = new Date(fmt("UTC").replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
    const tzDate = new Date(fmt(tz).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
    return tzDate.getTime() - utcDate.getTime();
  } catch {
    return 0;
  }
}

/**
 * Tính thời điểm chạy tiếp theo của cron expression theo timezone.
 * Returns real UTC Date, hoặc null nếu cron không hợp lệ.
 */
export function cronNextDate(cron: string, from: Date = new Date(), tz?: string): Date | null {
  try {
    const timezone = tz ?? getConfiguredTimezone();
    const offsetMs = getTzOffsetMs(timezone, from);

    // Shift `from` vào TZ space (fake UTC)
    const fakeUtc = new Date(from.getTime() + offsetMs);
    const parsedFake = Bun.cron.parse(cron, fakeUtc) ?? null;
    if (!parsedFake) return null;

    // DST-safe: tính offset tại thời điểm result
    const resultOffsetMs = getTzOffsetMs(timezone, parsedFake);
    return new Date(parsedFake.getTime() - resultOffsetMs);
  } catch {
    return null;
  }
}

/** Split jobs.cron field into individual 5-field expressions (newline-separated). */
export function parseJobCrons(cronField: string | null | undefined): string[] {
  if (!cronField?.trim()) return [];
  return cronField
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Earliest next run across one or more cron expressions in a jobs.cron field.
 * Returns null if the field is empty or any expression is invalid.
 */
export function cronNextDateMulti(cronField: string, from: Date = new Date(), tz?: string): Date | null {
  const expressions = parseJobCrons(cronField);
  if (expressions.length === 0) return null;

  let earliest: Date | null = null;
  for (const expr of expressions) {
    const next = cronNextDate(expr, from, tz);
    if (!next) return null;
    if (!earliest || next.getTime() < earliest.getTime()) earliest = next;
  }
  return earliest;
}
