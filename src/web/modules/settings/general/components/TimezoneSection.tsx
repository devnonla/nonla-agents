import { Select, message } from "@nonla-agents/ui";
import { ClockCircleIcon } from "@solar-icons/react/dynamic/clock-circle";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { invalidateAppTimezoneCache } from "src/common/hooks/useAppTimezone";
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

  const selected = tzList.find((item) => item.tz === currentTz);

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
    <section className="max-w-lg rounded-2xl border border-white/50 bg-white/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-foreground">
          <ClockCircleIcon size={20} weight="BoldDuotone" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-semibold text-foreground">Timezone</h3>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">Used for scheduled tasks and time display in agent system prompts.</p>
          <Select value={currentTz} onChange={handleTzChange} options={tzOptions} placeholder={loadingTz ? "Loading timezones…" : "Search timezone…"} disabled={loadingTz} showSearch={{ optionFilterProp: "label" }} className="w-full border-neutral-300 bg-[#f7f8f7] focus:bg-[#f7f8f7] data-[state=open]:bg-[#f7f8f7]" />
          {selected ? <p className="mt-2 mb-0 text-[11px] tabular-nums text-tertiary-foreground">Offset {selected.offset}</p> : null}
        </div>
      </div>
    </section>
  );
}
