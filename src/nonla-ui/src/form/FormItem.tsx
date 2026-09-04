import { useState, type ComponentType } from "react";
import { Controller, type Control, type FieldValues } from "react-hook-form";
import { cn } from "../lib/cn";
import { EFormItemType } from "./common/enum";
import { fieldNameOf, hydrateRules, isRuleRequired } from "./common/rules";
import type { TFormItemCustom, TFormItemProps } from "./common/types";
import { FormItemHelps } from "./partials/FormItemHelps";
import { FieldCheckbox } from "./variants/FieldCheckbox";
import { FieldColor } from "./variants/FieldColor";
import { FieldDateTime } from "./variants/FieldDateTime";
import { FieldHidden } from "./variants/FieldHidden";
import { FieldInput } from "./variants/FieldInput";
import { FieldNumber } from "./variants/FieldNumber";
import { FieldObject } from "./variants/FieldObject";
import { FieldRadio } from "./variants/FieldRadio";
import { FieldRepeater } from "./variants/FieldRepeater";
import { FieldSelect } from "./variants/FieldSelect";
import { FieldSelectMultiple } from "./variants/FieldSelectMultiple";
import { FieldSelectRemote } from "./variants/FieldSelectRemote";
import { FieldSwitch } from "./variants/FieldSwitch";
import { FieldTextarea } from "./variants/FieldTextarea";
import { FieldTime } from "./variants/FieldTime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldComponents: Partial<Record<EFormItemType, ComponentType<any>>> = {
  [EFormItemType.Input]: FieldInput,
  [EFormItemType.Number]: FieldNumber,
  [EFormItemType.Select]: FieldSelect,
  [EFormItemType.SelectMultiple]: FieldSelectMultiple,
  [EFormItemType.Hidden]: FieldHidden,
  [EFormItemType.Repeater]: FieldRepeater,
  [EFormItemType.SelectRemote]: FieldSelectRemote,
  [EFormItemType.Radio]: FieldRadio,
  [EFormItemType.Object]: FieldObject,
  [EFormItemType.Textarea]: FieldTextarea,
  [EFormItemType.Color]: FieldColor,
  [EFormItemType.DateTime]: FieldDateTime,
  [EFormItemType.Time]: FieldTime,
  [EFormItemType.Switch]: FieldSwitch,
  [EFormItemType.Checkbox]: FieldCheckbox,
  [EFormItemType.JSON]: FieldTextarea,
  [EFormItemType.Editor]: FieldTextarea,
};

export type FormItemProps = TFormItemProps & {
  control: Control<FieldValues>;
};

function isCustomItem(props: TFormItemProps): props is TFormItemCustom {
  return props.type === EFormItemType.Custom;
}

export function FormItem(props: FormItemProps) {
  const {
    label,
    helps,
    rules,
    type,
    collapsable = false,
    className,
    labelClassName,
    innerClassName,
    colSpan = 12,
    control,
    name,
  } = props;

  const [collapsed, setCollapsed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FieldComponent: ComponentType<any> | undefined = type ? fieldComponents[type] : FieldInput;
  const fieldName = fieldNameOf(name);
  const required = isRuleRequired(rules);
  const rhfRules = hydrateRules(rules);

  if (type === EFormItemType.Hidden) {
    return FieldComponent ? (
      <Controller
        control={control}
        name={fieldName}
        rules={rhfRules}
        render={({ field }) => <FieldComponent {...props} field={field} />}
      />
    ) : null;
  }

  return (
    <Controller
      control={control}
      name={fieldName}
      rules={rhfRules}
      render={({ field, fieldState }) => (
        <div className={cn("flex flex-col gap-1.5", className)} style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}>
          {label != null && label !== "" ? (
            <div className={cn("flex flex-row items-center gap-2", labelClassName)}>
              {collapsable ? (
                <button
                  type="button"
                  aria-label={collapsed ? "Expand" : "Collapse"}
                  className="inline-flex size-4 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-muted p-0 text-muted-foreground"
                  onClick={() => setCollapsed((v) => !v)}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                    className={cn("transition-transform", collapsed && "-rotate-90")}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
              <label className="text-sm text-foreground">
                {label}
                {required ? <span className="ml-1 text-destructive">*</span> : null}
              </label>
            </div>
          ) : null}

          <div
            className={cn(
              "flex flex-col transition-[max-height]",
              collapsable && label ? "pl-6" : "",
              collapsed ? "max-h-0 overflow-hidden" : "",
              innerClassName,
            )}
          >
            {isCustomItem(props) ? (
              props.render({ field, fieldState, status: fieldState.error ? "error" : undefined })
            ) : FieldComponent ? (
              <FieldComponent {...props} field={field} control={control} status={fieldState.error ? "error" : undefined} />
            ) : null}

            <FormItemHelps items={helps} />

            <div className="min-h-6 pt-1 text-xs leading-snug" role={fieldState.error?.message ? "alert" : undefined}>
              {fieldState.error?.message ? <div className="pl-2.75 text-destructive">{fieldState.error.message}</div> : null}
            </div>
          </div>
        </div>
      )}
    />
  );
}
