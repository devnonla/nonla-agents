import { inArray } from "drizzle-orm";
import { appSettings, getDb } from "../../common/db/client.js";
import { recalculateAllJobSchedules } from "../jobs/jobs.service.js";

const HIDDEN_SETTINGS_KEYS = new Set(["jwt_secret", "secret_encryption_key"]);

/** Load only the requested setting keys. Never returns jwt_secret / secret_encryption_key. */
export function loadSettingsByKeys(keys: string[]): Record<string, string> {
  const safeKeys = keys.filter((k) => !HIDDEN_SETTINGS_KEYS.has(k));
  if (safeKeys.length === 0) return {};
  const rows = getDb().select().from(appSettings).where(inArray(appSettings.key, safeKeys)).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function saveSettings(body: Record<string, string>) {
  const db = getDb();
  const now = new Date();
  let timezoneChanged = false;
  for (const [key, value] of Object.entries(body)) {
    if (HIDDEN_SETTINGS_KEYS.has(key)) continue;
    if (key === "timezone") timezoneChanged = true;
    db.insert(appSettings)
      .values({ key, value: String(value), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedAt: now } })
      .run();
  }
  if (timezoneChanged) {
    try {
      recalculateAllJobSchedules();
    } catch {
      /* jobs table may not exist in older test fixtures */
    }
  }
}
