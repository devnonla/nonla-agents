import * as Dialog from "@radix-ui/react-dialog";
import {
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "../button/Button";
import { cn } from "../lib/cn";

/** Matches `--nonla-dur-fast` exit animation; fallback if animationend is skipped. */
const EXIT_MS = 200;

export type ModalProps = {
  open?: boolean;
  visible?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode | null;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
  afterClose?: () => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: Record<string, unknown>;
  cancelButtonProps?: Record<string, unknown>;
  confirmLoading?: boolean;
  width?: number | string;
  centered?: boolean;
  destroyOnClose?: boolean;
  destroyOnHidden?: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  className?: string;
  /** Root positioning (antd `style={{ top }}`). */
  style?: CSSProperties;
  styles?: { body?: CSSProperties; content?: CSSProperties; header?: CSSProperties; footer?: CSSProperties; container?: CSSProperties };
  onOpenChange?: (open: boolean) => void;
};

export type ModalConfirmProps = {
  title?: ReactNode;
  content?: ReactNode;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okType?: "primary" | "danger" | "default";
  okButtonProps?: { danger?: boolean; color?: string; type?: string };
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  centered?: boolean;
  width?: number | string;
};

type ConfirmHandle = { destroy: () => void; update: (p: Partial<ModalConfirmProps>) => void };

function ModalView({
  open,
  visible,
  title,
  children,
  footer,
  onOk,
  onCancel,
  onClose,
  afterClose,
  okText = "OK",
  cancelText = "Cancel",
  okButtonProps,
  cancelButtonProps,
  confirmLoading,
  width = 480,
  centered = false,
  destroyOnClose,
  destroyOnHidden,
  closable = true,
  maskClosable = true,
  className,
  style,
  styles,
  onOpenChange,
}: ModalProps) {
  const isOpen = open ?? visible ?? false;
  const [loading, setLoading] = useState(false);
  const shouldDestroy = Boolean(destroyOnHidden ?? destroyOnClose);
  // Keep body mounted through the exit animation; clear only after it finishes.
  const [present, setPresent] = useState(isOpen);
  const closedRef = useRef(true);
  const wasOpenRef = useRef(isOpen);
  const afterCloseRef = useRef(afterClose);
  afterCloseRef.current = afterClose;

  const finishExit = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (shouldDestroy) setPresent(false);
    afterCloseRef.current?.();
  };

  useEffect(() => {
    if (isOpen) {
      closedRef.current = false;
      wasOpenRef.current = true;
      setPresent(true);
      return;
    }
    // Only schedule exit cleanup after an open→close transition (not initial mount).
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const t = window.setTimeout(finishExit, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [isOpen, shouldDestroy]);

  const body = !shouldDestroy || present ? children : null;

  const close = () => {
    onOpenChange?.(false);
    onCancel?.();
    onClose?.();
  };

  const handleOk = async () => {
    try {
      setLoading(true);
      await onOk?.();
      onOpenChange?.(false);
    } finally {
      setLoading(false);
    }
  };

  const busy = confirmLoading ?? loading;

  const defaultFooter =
    footer === null ? null : footer !== undefined ? (
      footer
    ) : (
      <>
        <Button type="default" onClick={close} {...(cancelButtonProps as object)}>
          {cancelText}
        </Button>
        <Button type="primary" loading={busy} onClick={handleOk} {...(okButtonProps as object)}>
          {okText}
        </Button>
      </>
    );

  const onContentAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!isOpen) finishExit();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) {
          onCancel?.();
          onClose?.();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="nonla-modal-overlay" />
        <Dialog.Content
          className={cn("nonla-modal-content", className)}
          data-centered={centered ? "true" : undefined}
          style={{ width, ...style, ...styles?.container, ...styles?.content }}
          onAnimationEnd={onContentAnimationEnd}
          onPointerDownOutside={(e) => {
            if (!maskClosable) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!maskClosable) e.preventDefault();
          }}
        >
          {(title || closable) && (
            <div className="nonla-modal-header" style={styles?.header}>
              <Dialog.Title className="nonla-modal-title">{title}</Dialog.Title>
              {closable ? (
                <Dialog.Close className="nonla-modal-close" aria-label="Close">
                  ×
                </Dialog.Close>
              ) : null}
            </div>
          )}
          <div className="nonla-modal-body" style={styles?.body}>
            {body}
          </div>
          {defaultFooter != null ? (
            <div className="nonla-modal-footer" style={styles?.footer}>
              {typeof defaultFooter === "function" ? null : defaultFooter}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmHost({ initial, onDone }: { initial: ModalConfirmProps; onDone: () => void }) {
  const [open, setOpen] = useState(true);
  const [props, setProps] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (ConfirmHost as unknown as { _update?: (p: Partial<ModalConfirmProps>) => void })._update = (p) => setProps((prev) => ({ ...prev, ...p }));
  }, []);

  const close = () => {
    setOpen(false);
    props.onCancel?.();
  };

  const ok = async () => {
    try {
      setLoading(true);
      await props.onOk?.();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const danger = props.okType === "danger" || props.okButtonProps?.danger;

  return (
    <ModalView
      open={open}
      title={props.title}
      width={props.width}
      centered={props.centered}
      confirmLoading={loading}
      okText={props.okText ?? "OK"}
      cancelText={props.cancelText ?? "Cancel"}
      okButtonProps={{ danger }}
      onOk={ok}
      onCancel={close}
      afterClose={onDone}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      {props.content}
    </ModalView>
  );
}

function mountConfirm(props: ModalConfirmProps): ConfirmHandle {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  const destroy = () => {
    root.unmount();
    el.remove();
  };
  root.render(<ConfirmHost initial={props} onDone={destroy} />);
  return {
    destroy,
    update: (p) => (ConfirmHost as unknown as { _update?: (x: Partial<ModalConfirmProps>) => void })._update?.(p),
  };
}

export const Modal = Object.assign(ModalView, {
  confirm: (props: ModalConfirmProps) => mountConfirm(props),
  info: (props: ModalConfirmProps) => mountConfirm(props),
  warning: (props: ModalConfirmProps) => mountConfirm(props),
  error: (props: ModalConfirmProps) => mountConfirm({ ...props, okType: "danger" }),
  success: (props: ModalConfirmProps) => mountConfirm(props),
});
