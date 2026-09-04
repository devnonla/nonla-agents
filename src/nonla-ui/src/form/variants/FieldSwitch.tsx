import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Switch } from "../../switch/Switch";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
};

export function FieldSwitch({ field, options }: Props) {
  return (
    <Switch
      checked={Boolean(field.value)}
      onChange={(checked) => field.onChange(checked)}
      disabled={options?.disabled as boolean | undefined}
    />
  );
}
