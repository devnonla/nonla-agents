import * as Dialog from "@radix-ui/react-dialog";
import { type AnimationEvent, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

/** Matches `--nonla-dur-fast` exit animation; fallback if animationend is skipped. */
const EXIT_MS = 200;

export type DrawerPlacement = "right" | "left" | "top" | "bottom";

export type DrawerProps = {
  open?: boolean;
  visible?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  width?: number | string;
  /** antd: width for left/right, height for top/bottom. */
  size?: number | string;
  placement?: DrawerPlacement;
  destroyOnClose?: boolean;
  destroyOnHidden?: boolean;
  className?: string;
  footer?: ReactNode;
  closable?: boolean;
  styles?: { body?: CSSProperties; header?: CSSProperties; footer?: CSSProperties; content?: CSSProperties };
};

export function Drawer({
  open,
  visible,
  onClose,
  onOpenChange,
  title,
  extra,
  children,
  width,
  size,
  placement = "right",
  destroyOnClose,
  destroyOnHidden,
  className,
  footer,
  closable = true,
  styles,
}: DrawerProps) {
  const isOpen = open ?? visible ?? false;
  const shouldDestroy = Boolean(destroyOnHidden ?? destroyOnClose);
  const [present, setPresent] = useState(isOpen);
  const wasOpenRef = useRef(isOpen);
  const vertical = placement === "top" || placement === "bottom";
  const dim = size ?? width ?? (vertical ? 378 : 378);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      setPresent(true);
      return;
    }
    if (!shouldDestroy || !wasOpenRef.current) return;
    wasOpenRef.current = false;
    const t = window.setTimeout(() => setPresent(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [isOpen, shouldDestroy]);

  const showBody = !shouldDestroy || present;

  const onContentAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!isOpen && shouldDestroy) setPresent(false);
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="nonla-overlay z-[9980]" />
        <Dialog.Content
          data-side={placement}
          className={cn(
            "nonla-drawer-panel fixed z-[9981] flex flex-col border-border bg-card text-card-foreground shadow-[var(--elevated-shadow)] outline-none",
            placement === "right" && "top-0 right-0 bottom-0 max-w-[100vw] border-l",
            placement === "left" && "top-0 left-0 bottom-0 max-w-[100vw] border-r",
            placement === "bottom" && "right-0 bottom-0 left-0 max-h-[100vh] border-t",
            placement === "top" && "top-0 right-0 left-0 max-h-[100vh] border-b",
            className,
          )}
          style={{
            ...(vertical ? { height: dim, width: "100%" } : { width: dim }),
            ...styles?.content,
          }}
          onAnimationEnd={onContentAnimationEnd}
        >
          {(title || closable || extra) && (
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4" style={styles?.header}>
              <Dialog.Title className="m-0 min-w-0 flex-1 text-base font-semibold">{title}</Dialog.Title>
              {extra ? <div className="flex shrink-0 items-center gap-2">{extra}</div> : null}
              {closable ? (
                <Dialog.Close className="text-muted-foreground hover:text-foreground text-lg leading-none" aria-label="Close">
                  ×
                </Dialog.Close>
              ) : null}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4" style={styles?.body}>
            {showBody ? children : null}
          </div>
          {footer != null ? (
            <div className="border-t border-border px-5 py-3" style={styles?.footer}>
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
