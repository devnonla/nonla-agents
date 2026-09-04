import { useCallback, useEffect, useMemo, useRef } from "react";
import { FormProvider, type FieldValues, type UseFormReturn, useWatch } from "react-hook-form";
import { cn } from "../lib/cn";
import { FormExtraContext, type FormFetcher } from "./common/context";
import { fieldNameOf } from "./common/rules";
import type { TFormItemProps } from "./common/types";
import { FormItem } from "./FormItem";

export type FormProps<T extends FieldValues = FieldValues> = {
  form: UseFormReturn<T>;
  items: TFormItemProps[];
  onValuesChange?: (allValues: T) => void;
  /** Injected for `select_remote` — UI package never imports app API. */
  fetcher?: FormFetcher;
  className?: string;
  /** Debounce ms for onValuesChange (default 300). */
  valuesChangeDebounce?: number;
};

function evalCondition(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
  switch (operator) {
    case "==":
      // eslint-disable-next-line eqeqeq
      return fieldValue == compareValue;
    case "!=":
      // eslint-disable-next-line eqeqeq
      return fieldValue != compareValue;
    case ">=":
      return (fieldValue as number) >= (compareValue as number);
    case "<=":
      return (fieldValue as number) <= (compareValue as number);
    case ">":
      return (fieldValue as number) > (compareValue as number);
    case "<":
      return (fieldValue as number) < (compareValue as number);
    default:
      return false;
  }
}

function matchConditions(form: UseFormReturn<FieldValues>, conditions?: TFormItemProps["conditions"]): boolean {
  if (!conditions?.length) return true;
  for (const group of conditions) {
    let andOk = true;
    for (const [fieldName, operator, compareValue] of group) {
      const fieldValue = form.getValues(fieldName);
      andOk = andOk && evalCondition(fieldValue, operator, compareValue);
    }
    if (andOk) return true;
  }
  return false;
}

export function Form<T extends FieldValues = FieldValues>({
  form,
  items,
  onValuesChange,
  fetcher,
  className,
  valuesChangeDebounce = 300,
}: FormProps<T>) {
  const watchValues = useWatch({ control: form.control });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onValuesChangeRef = useRef(onValuesChange);
  onValuesChangeRef.current = onValuesChange;

  useEffect(() => {
    if (!onValuesChangeRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onValuesChangeRef.current?.(form.getValues());
    }, valuesChangeDebounce);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [watchValues, form, valuesChangeDebounce]);

  const extra = useMemo(() => ({ fetcher }), [fetcher]);

  const renderItem = useCallback(
    (item: TFormItemProps, index: number) => {
      if (!matchConditions(form as UseFormReturn<FieldValues>, item.conditions)) return null;
      return <FormItem key={`${fieldNameOf(item.name)}-${index}`} {...item} control={form.control as never} />;
    },
    [form],
  );

  return (
    <FormExtraContext.Provider value={extra}>
      <FormProvider {...form}>
        <div className={cn("grid grid-cols-12 gap-x-4", className)}>{items.map((item, index) => renderItem(item, index))}</div>
      </FormProvider>
    </FormExtraContext.Provider>
  );
}
