import { type CSSProperties, type ReactNode, useState } from "react";
import { Button } from "../button/Button";
import { cn } from "../lib/cn";
import { type PopperPlacement } from "../lib/placement";
import { Popover } from "../popover/Popover";

export type PopconfirmProps = {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okType?: "primary" | "default" | "dashed" | "link" | "text" | "danger";
  okButtonProps?: { danger?: boolean; type?: string; color?: string; variant?: string };
  cancelButtonProps?: Record<string, unknown>;
  /** Customize / hide the leading icon. Pass `null` to hide. */
  icon?: ReactNode | null;
  showCancel?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopperPlacement;
  className?: string;
  overlayClassName?: string;
  getPopupContainer?: () => HTMLElement;
  styles?: { root?: CSSProperties };
};

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="8" cy="8" r="8" fill="var(--warn)" />
      <path d="M8 4.4V8.6M8 10.7V11.4" stroke="#121212" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Popconfirm({
  title,
  description,
  children,
  onConfirm,
  onCancel,
  okText = "OK",
  cancelText = "Cancel",
  okType = "primary",
  okButtonProps,
  cancelButtonProps,
  icon,
  showCancel = true,
  disabled,
  open: openProp,
  onOpenChange,
  placement = "top",
  className,
  overlayClassName,
  getPopupContainer,
  styles,
}: PopconfirmProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };

  if (disabled) return <>{children}</>;

  const showIcon = icon !== null;
  const resolvedIcon = icon === undefined ? <WarningIcon /> : icon;
  const okDanger = okType === "danger" || okButtonProps?.danger;
  const okBtnType = okButtonProps?.type ?? (okType === "danger" ? "primary" : okType);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      arrow
      overlayClassName={overlayClassName}
      contentClassName={cn("p-3!", className)}
      getPopupContainer={getPopupContainer}
      style={styles?.root}
      content={
        <div className="min-w-48 max-w-72">
          <div className="flex gap-2">
            {showIcon ? <span className="nonla-popconfirm-icon">{resolvedIcon}</span> : null}
            <div className="min-w-0 flex-1">
              {title != null && title !== false ? <div className="text-sm font-medium leading-snug text-foreground">{title}</div> : null}
              {description != null && description !== false ? <div className={cn("text-[13px] leading-snug text-muted-foreground", title != null && title !== false && "mt-1")}>{description}</div> : null}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {showCancel ? (
              <Button
                size="small"
                type="default"
                {...(cancelButtonProps as object)}
                onClick={() => {
                  setOpen(false);
                  onCancel?.();
                }}
              >
                {cancelText}
              </Button>
            ) : null}
            <Button
              size="small"
              type={okBtnType as "primary" | "default" | "dashed" | "link" | "text"}
              danger={okDanger}
              loading={loading}
              onClick={async () => {
                try {
                  setLoading(true);
                  await onConfirm?.();
                  setOpen(false);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {okText}
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}
