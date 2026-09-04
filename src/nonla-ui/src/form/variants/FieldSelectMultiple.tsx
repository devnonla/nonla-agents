import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Checkbox } from "../../checkbox/Checkbox";
import type { ISelectItemProps } from "../common/types";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  choices?: ISelectItemProps[];
};

export function FieldSelectMultiple({ field, choices }: Props) {
  const value: Array<string | number> = Array.isArray(field.value) ? field.value : [];

  return (
    <div className="flex flex-col gap-2">
      {(choices ?? []).map((item) => (
        <Checkbox
          key={String(item.value)}
          checked={value.includes(item.value)}
          onChange={(checked) => {
            if (checked) {
              field.onChange([...value, item.value]);
            } else {
              field.onChange(value.filter((v) => v !== item.value));
            }
          }}
        >
          {item.label}
        </Checkbox>
      ))}
    </div>
  );
}
