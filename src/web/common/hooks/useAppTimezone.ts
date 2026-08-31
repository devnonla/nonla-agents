import { useEffect, useState } from "react";
import { SettingKey } from "src/common/enum";
import { getSettingValues } from "src/modules/settings/common/settingsApi";

const FALLBACK_TZ = "UTC";

let cachedTz: string | null = null;
let inflight: Promise<string> | null = null;

async function loadAppTimezone(): Promise<string> {
  if (cachedTz) return cachedTz;
  if (!inflight) {
    inflight = getSettingValues([SettingKey.Timezone])
      .then((s) => {
        const tz = s[SettingKey.Timezone]?.trim() || FALLBACK_TZ;
        cachedTz = tz;
        return tz;
      })
      .catch(() => {
        cachedTz = FALLBACK_TZ;
        return FALLBACK_TZ;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop cached value so the next read refetches (e.g. after settings change). */
export function invalidateAppTimezoneCache(): void {
  cachedTz = null;
}

/**
 * System timezone from Settings → General.
 * Shared across the app (datagrid display, pickers, etc.).
 */
export function useAppTimezone(): string {
  const [tz, setTz] = useState(cachedTz ?? FALLBACK_TZ);

  useEffect(() => {
    let alive = true;
    void loadAppTimezone().then((next) => {
      if (alive) setTz(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return tz;
}
