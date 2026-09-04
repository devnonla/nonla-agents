import { inArray } from "drizzle-orm";
import { appSettings, getDb } from "../../common/db/client.js";
import { qall, qrun } from "../../common/db/query.js";
import { getConfiguredTimezone } from "../../common/utils/cronHelper.js";
import { recalculateAllJobSchedules } from "../jobs/jobs.service.js";

const HIDDEN_SETTINGS_KEYS = new Set(["jwt_secret", "secret_encryption_key"]);

/** Load only the requested setting keys. Never returns jwt_secret / secret_encryption_key. */
export async function loadSettingsByKeys(keys: string[]): Promise<Record<string, string>> {
  const safeKeys = keys.filter((k) => !HIDDEN_SETTINGS_KEYS.has(k));
  if (safeKeys.length === 0) return {};
  const rows = await qall(getDb().select().from(appSettings).where(inArray(appSettings.key, safeKeys)));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveSettings(body: Record<string, string>) {
  const db = getDb();
  const now = new Date();
  let timezoneChanged = false;
  for (const [key, value] of Object.entries(body)) {
    if (HIDDEN_SETTINGS_KEYS.has(key)) continue;
    if (key === "timezone") timezoneChanged = true;
    await qrun(
      db
        .insert(appSettings)
        .values({ key, value: String(value), updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedAt: now } }),
    );
  }
  if (timezoneChanged) {
    await getConfiguredTimezone();
    try {
      await recalculateAllJobSchedules();
    } catch {
      /* jobs table may not exist in older test fixtures */
    }
  }
}
