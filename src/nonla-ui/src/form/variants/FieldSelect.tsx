import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Select } from "../../select/Select";
import type { ISelectItemProps } from "../common/types";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  choices?: ISelectItemProps[];
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldSelect({ field, choices, options, status }: Props) {
  const opts = options ?? {};
  return (
    <Select
      className="w-full"
      value={field.value == null || field.value === "" ? null : (field.value as string | number)}
      onChange={(v) => field.onChange(v)}
      placeholder={(opts.placeholder as string) ?? "Select..."}
      disabled={opts.disabled as boolean | undefined}
      showSearch={opts.searchable === true}
      allowClear={opts.allowClear as boolean | undefined}
      status={status}
      options={(choices ?? []).map((c) => ({ label: c.label, value: c.value }))}
    />
  );
}
