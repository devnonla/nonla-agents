import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { type ComponentPropsWithoutRef, type ReactNode, forwardRef } from "react";
import { cn } from "../lib/cn";

export type CheckboxProps = Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onCheckedChange" | "checked" | "onChange"> & {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  /** antd-style — receives next checked boolean (not a DOM event). */
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
  indeterminate?: boolean;
};

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 5.2L4.1 7.2L8 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, checked, defaultChecked, onChange, children, indeterminate, disabled, ...rest },
  ref,
) {
  const resolved = indeterminate ? "indeterminate" : checked;
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-foreground cursor-pointer", disabled && "opacity-45 cursor-not-allowed")}>
      <CheckboxPrimitive.Root
        ref={ref}
        checked={resolved}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={(v) => onChange?.(v === true)}
        className={cn(
          "size-4 shrink-0 rounded-[4px] border border-input bg-[var(--control-bg)] transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "focus-visible:outline-none data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-[var(--nonla-solid-fg)]",
          "data-[state=indeterminate]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:text-[var(--nonla-solid-fg)]",
          className,
        )}
        {...rest}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current animate-[nonla-check-in_150ms_cubic-bezier(0.16,1,0.3,1)]">
          <CheckIcon />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {children != null ? <span>{children}</span> : null}
    </label>
  );
});
