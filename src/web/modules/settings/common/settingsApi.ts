import { apiClient } from "src/common/api";

/** Fetch specific setting values by keys. Returns a key-value map. */
export async function getSettingValues(keys: string[]): Promise<Record<string, string>> {
  return apiClient.get<Record<string, string>>(`/api/settings/values?keys=${keys.join(",")}`);
}

/** Save (upsert) setting values. */
export async function saveSettingValues(patch: Record<string, string>): Promise<void> {
  await apiClient.patch("/api/settings", patch);
}
