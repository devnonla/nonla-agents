import type { Control, FieldValues } from "react-hook-form";
import { fieldNameOf } from "../common/rules";
import type { TFormItemProps } from "../common/types";
import { FormItem } from "../FormItem";

type Props = {
  control: Control<FieldValues>;
  name: string | string[] | number[];
  childItems?: TFormItemProps[];
};

export function FieldObject({ control, name, childItems }: Props) {
  const prefix = fieldNameOf(name);
  return (
    <div className="grid grid-cols-12 gap-x-4">
      {(childItems ?? []).map((child, index) => {
        const childName = fieldNameOf(child.name);
        return (
          <FormItem
            key={`${prefix}.${childName}-${index}`}
            {...child}
            name={`${prefix}.${childName}`}
            control={control}
          />
        );
      })}
    </div>
  );
}
