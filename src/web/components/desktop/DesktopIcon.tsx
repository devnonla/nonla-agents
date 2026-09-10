import { type ReactNode, forwardRef } from "react";
import { AppIcon } from "./AppIcon";

const iconButtonClass = "group w-[96px] flex flex-col items-center gap-2 py-2 px-0 rounded-md border-none cursor-pointer select-none outline-none bg-transparent focus-visible:outline-2 focus-visible:outline-brand motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]";

const labelClass = "text-[12px] leading-[18px] font-semibold text-center line-clamp-2 w-full";

function plateClass(active: boolean) {
  return `w-11 h-11 flex items-center justify-center filter-[drop-shadow(0_1px_2px_rgba(0,0,0,0.45))] ${active ? "ring-2 ring-brand rounded-[10px]" : ""}`;
}

export const DesktopIcon = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    icon?: string;
    media?: ReactNode;
    active?: boolean;
    onCard?: boolean;
    onClick?: () => void;
  }
>(function DesktopIcon({ label, icon, media, active = false, onCard = false, onClick }, ref) {
  return (
    <button ref={ref} type="button" title={label} aria-label={label} aria-current={active ? "true" : undefined} dir="ltr" onClick={onClick} className={iconButtonClass}>
      {media ?? (
        <span className={plateClass(active)}>
          <AppIcon name={icon ?? "Sparkles"} size={32} />
        </span>
      )}
      <span className={`${labelClass} ${onCard ? "text-foreground" : "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"}`}>{label}</span>
    </button>
  );
});
