import * as PopoverPrimitive from "@radix-ui/react-popover";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { useAppConfig } from "../app/App";
import { cn } from "../lib/cn";
import { type PopperPlacement, placementToRadix } from "../lib/placement";

export type PopoverProps = {
  content?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: "click" | "hover";
  placement?: PopperPlacement;
  mouseEnterDelay?: number;
  mouseLeaveDelay?: number;
  getPopupContainer?: () => HTMLElement;
  /** Show arrow pointing at the trigger (antd default for Popconfirm). */
  arrow?: boolean | { pointAtCenter?: boolean };
  className?: string;
  overlayClassName?: string;
  /** Extra class on the content panel (padding / width). */
  contentClassName?: string;
  style?: CSSProperties;
  /** antd `styles` — `root`/`body` map to content panel; `container` accepted as alias. */
  styles?: {
    root?: CSSProperties;
    body?: CSSProperties;
    content?: CSSProperties;
    container?: CSSProperties;
  };
};

export function Popover({
  content,
  title,
  children,
  open: openProp,
  defaultOpen,
  onOpenChange,
  trigger = "click",
  placement = "bottom",
  mouseEnterDelay = 0.1,
  mouseLeaveDelay = 0.1,
  getPopupContainer,
  arrow = false,
  className,
  overlayClassName,
  contentClassName,
  style,
  styles,
}: PopoverProps) {
  const showArrow = Boolean(arrow);
  const panelStyle = { ...style, ...styles?.root, ...styles?.content, ...styles?.container, ...styles?.body };
  const app = useAppConfig();
  const { side, align } = placementToRadix(placement);
  const hover = trigger === "hover";
  const [innerOpen, setInnerOpen] = useState(defaultOpen ?? false);
  const open = openProp ?? innerOpen;
  const enterTimer = useRef<number>(0);
  const leaveTimer = useRef<number>(0);

  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInnerOpen(v);
    onOpenChange?.(v);
  };

  useEffect(() => () => {
    window.clearTimeout(enterTimer.current);
    window.clearTimeout(leaveTimer.current);
  }, []);

  const onEnter = () => {
    if (!hover) return;
    window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => setOpen(true), mouseEnterDelay * 1000);
  };
  const onLeave = () => {
    if (!hover) return;
    window.clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), mouseLeaveDelay * 1000);
  };

  const container = getPopupContainer ?? app.getPopupContainer;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (hover && v) return;
        setOpen(v);
      }}
    >
      <PopoverPrimitive.Trigger asChild onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container?.()}>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={showArrow ? 8 : 6}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={cn(
            "z-[9999] w-max max-w-sm rounded-lg border border-[var(--popper-border)] bg-popover p-3 text-popover-foreground shadow-[var(--popper-shadow)] outline-none nonla-popper",
            contentClassName,
            className,
            overlayClassName,
          )}
          style={panelStyle}
        >
          {title ? <div className="mb-2 text-sm font-medium">{title}</div> : null}
          {content}
          {showArrow ? <PopoverPrimitive.Arrow width={12} height={6} className="fill-popover drop-shadow-[0_1px_0_var(--popper-border)]" /> : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
