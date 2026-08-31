import { Hono } from "hono";
import { loadSettingsByKeys, saveSettings } from "./settings.service.js";
import rawTimezones from "./timezones.json" with { type: "json" };

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TimezoneItem {
  tz: string; // IANA name, e.g. "Asia/Ho_Chi_Minh"
  offset: string; // e.g. "UTC+7" or "UTC+5:30"
}

/** Convert "+07:00" → "UTC+7", "-05:30" → "UTC-5:30", "UTC" → "UTC" */
function toUtcLabel(value: string): string {
  if (value === "UTC") return "UTC";
  const m = value.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return value;
  const sign = m[1];
  const h = Number.parseInt(m[2], 10);
  const min = Number.parseInt(m[3], 10);
  return min > 0 ? `UTC${sign}${h}:${String(min).padStart(2, "0")}` : `UTC${sign}${h}`;
}

/** Parse "+07:00" → numeric minutes (e.g. 420), for sorting */
function toOffsetMin(value: string): number {
  if (value === "UTC") return 0;
  const m = value.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (Number.parseInt(m[2], 10) * 60 + Number.parseInt(m[3], 10));
}

// Map static JSON (label/value) → TimezoneItem (tz/offset), sorted by offset then name
const TIMEZONE_LIST: TimezoneItem[] = (rawTimezones as Array<{ label: string; value: string }>)
  .map(({ label, value }) => ({ tz: label, offset: toUtcLabel(value), _min: toOffsetMin(value) }))
  .sort((a, b) => a._min - b._min || a.tz.localeCompare(b.tz))
  .map(({ tz, offset }) => ({ tz, offset }));

// ─── Routes ───────────────────────────────────────────────────────────────────

const app = new Hono();

// GET /api/settings/values?keys=key1,key2
app.get("/values", (c) => {
  const raw = c.req.query("keys") ?? "";
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return c.json({});
  return c.json(loadSettingsByKeys(keys));
});

// PATCH /api/settings
app.patch("/", async (c) => {
  const body = await c.req.json<Record<string, string>>();
  saveSettings(body);
  return c.json({ ok: true });
});

// GET /api/settings/timezones
app.get("/timezones", (c) => c.json(TIMEZONE_LIST));

export default app;
