import * as SwitchPrimitive from "@radix-ui/react-switch";
import { type CSSProperties, type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";
import { type ControlSize, controlRadiusVar, normalizeSize } from "../lib/sizes";

export type SwitchVariant = "default" | "square";

export type SwitchProps = Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "onCheckedChange" | "checked" | "onChange"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  /** antd-style — receives the next checked boolean (not a DOM event). */
  onChange?: (checked: boolean) => void;
  size?: ControlSize;
  variant?: SwitchVariant;
};

/** Switch track heights — shorter than Button/Input (antd-like). */
const SWITCH_TRACK_H = { small: 16, default: 22, large: 28 } as const;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ className, checked, defaultChecked, onChange, size, variant = "default", disabled, style, ...rest }, ref) {
  const trackH = SWITCH_TRACK_H[normalizeSize(size)];
  const trackW = Math.round(trackH * 1.8);
  const thumb = trackH - 4;
  const travel = trackW - thumb - 3;
  const square = variant === "square";
  const squareRadius = `max(3px, calc(${controlRadiusVar(size)} * 0.55))`;

  return (
    <SwitchPrimitive.Root
      ref={ref}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={onChange}
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center border border-transparent transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        square ? undefined : "rounded-full",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
        "data-[state=checked]:bg-brand data-[state=unchecked]:bg-secondary",
        className,
      )}
      style={{ width: trackW, height: trackH, borderRadius: square ? squareRadius : undefined, ...style }}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn("pointer-events-none block bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[var(--nonla-switch-travel)]", square ? undefined : "rounded-full")}
        style={
          {
            width: thumb,
            height: thumb,
            borderRadius: square ? `max(1px, calc(${squareRadius} - 1px))` : undefined,
            ["--nonla-switch-travel" as string]: `${travel}px`,
          } as CSSProperties
        }
      />
    </SwitchPrimitive.Root>
  );
});
