import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Checkbox } from "../../checkbox/Checkbox";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
};

export function FieldCheckbox({ field, options }: Props) {
  const checkboxLabel = options?.checkboxLabel as string | undefined;
  return (
    <Checkbox
      checked={Boolean(field.value)}
      onChange={(checked) => field.onChange(checked)}
      disabled={options?.disabled as boolean | undefined}
    >
      {checkboxLabel}
    </Checkbox>
  );
}
