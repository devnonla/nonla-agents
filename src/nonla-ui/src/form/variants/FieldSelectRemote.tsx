import { useEffect, useState } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Select } from "../../select/Select";
import { useFormExtra } from "../common/context";
import type { ISelectItemProps } from "../common/types";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  endpoint: string;
  keyProp: string;
  labelProp: string;
  dataProp?: string;
  status?: "error" | "warning";
};

export function FieldSelectRemote({ field, endpoint, keyProp, labelProp, dataProp, status }: Props) {
  const { fetcher } = useFormExtra();
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<ISelectItemProps[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!endpoint || !fetcher) return;
      setLoading(true);
      try {
        const rs = await fetcher(endpoint);
        if (cancelled) return;
        const arr = dataProp && rs && typeof rs === "object" ? (rs as Record<string, unknown>)[dataProp] : rs;
        if (Array.isArray(arr)) {
          setChoices(
            arr.map((item) => {
              const row = item as Record<string, unknown>;
              return {
                value: row[keyProp ?? "key"] as string | number,
                label: String(row[labelProp ?? "label"] ?? ""),
              };
            }),
          );
        }
      } catch (err) {
        console.error("[nonla-ui Form] select_remote fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, keyProp, labelProp, dataProp, fetcher]);

  return (
    <Select
      className="w-full"
      value={field.value == null || field.value === "" ? null : (field.value as string | number)}
      onChange={(v) => field.onChange(v)}
      placeholder={loading ? "Loading..." : "Select..."}
      disabled={loading && choices.length === 0}
      allowClear
      showSearch
      status={status}
      options={choices.map((c) => ({ label: c.label, value: c.value }))}
    />
  );
}
