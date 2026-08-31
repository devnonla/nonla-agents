import { Select, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { invalidateAppTimezoneCache } from "src/common/hooks/useAppTimezone";
import { SectionRow } from "src/components/SectionRow";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";

export function TimezoneSection() {
  const [currentTz, setCurrentTz] = useState("UTC");
  const [tzList, setTzList] = useState<{ tz: string; offset: string }[]>([]);
  const [loadingTz, setLoadingTz] = useState(true);

  useEffect(() => {
    getSettingValues([SettingKey.Timezone]).then((s) => {
      if (s[SettingKey.Timezone]) setCurrentTz(s[SettingKey.Timezone]);
    });
    apiClient
      .get<{ tz: string; offset: string }[]>("/api/settings/timezones")
      .then(setTzList)
      .catch(() => setTzList([]))
      .finally(() => setLoadingTz(false));
  }, []);

  const tzOptions = tzList.map(({ tz, offset }) => ({
    value: tz,
    label: `${tz} (${offset})`,
  }));

  const handleTzChange = useCallback(async (value: string) => {
    try {
      setCurrentTz(value);
      await saveSettingValues({ [SettingKey.Timezone]: value });
      invalidateAppTimezoneCache();
      message.success("Timezone saved");
    } catch {
      message.error("Failed to save timezone");
    }
  }, []);

  return (
    <SectionRow title="Timezone" description="Used for scheduled tasks and time display in agent system prompts.">
      <div className="max-w-sm space-y-1.5">
        <Select value={currentTz} onChange={handleTzChange} options={tzOptions} placeholder={loadingTz ? "Loading timezones…" : "Search timezone…"} disabled={loadingTz} showSearch={{ optionFilterProp: "label" }} className="w-full" />
      </div>
    </SectionRow>
  );
}
