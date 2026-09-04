import { type CSSProperties, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export type MessageType = "success" | "error" | "info" | "warning" | "loading";

export type MessageConfig = {
  content: ReactNode;
  duration?: number;
  type?: MessageType;
  key?: string | number;
  icon?: ReactNode;
  onClose?: () => void;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

type Active = {
  id: string;
  type: MessageType;
  content: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  leaving?: boolean;
};

type TypeOpen = {
  (content: ReactNode, duration?: number, onClose?: () => void): () => void;
  (config: MessageConfig): () => void;
};

let hostEl: HTMLDivElement | null = null;
let root: Root | null = null;
let items: Active[] = [];
const timers = new Map<string, number>();

function IconSuccess() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="var(--success)" />
      <path d="M4.6 8.15L6.85 10.3L11.4 5.7" stroke="#121212" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconError() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="var(--destructive)" />
      <path d="M5.4 5.4L10.6 10.6M10.6 5.4L5.4 10.6" stroke="#fafafa" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="var(--link)" />
      <path d="M8 7.1V11.2M8 4.8V5.5" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="var(--warn)" />
      <path d="M8 4.6V8.8M8 10.8V11.4" stroke="#121212" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconLoading() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="nonla-message-spin">
      <circle cx="8" cy="8" r="6.25" stroke="color-mix(in oklab, var(--link) 30%, transparent)" strokeWidth="2" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="var(--link)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function defaultIcon(type: MessageType) {
  switch (type) {
    case "success":
      return <IconSuccess />;
    case "error":
      return <IconError />;
    case "warning":
      return <IconWarning />;
    case "loading":
      return <IconLoading />;
    default:
      return <IconInfo />;
  }
}

function MessageList({ list }: { list: Active[] }) {
  return (
    <>
      {list.map((item) => (
        <div
          key={item.id}
          className={["nonla-message-item", item.leaving ? "is-leaving" : "", item.className].filter(Boolean).join(" ")}
          data-type={item.type}
          role="status"
          style={item.style}
          onClick={item.onClick}
        >
          <span className="nonla-message-icon">{item.icon ?? defaultIcon(item.type)}</span>
          <span className="nonla-message-content">{item.content}</span>
        </div>
      ))}
    </>
  );
}

function ensureHost() {
  if (hostEl && root) return;
  hostEl = document.createElement("div");
  hostEl.className = "nonla-message-host";
  document.body.appendChild(hostEl);
  root = createRoot(hostEl);
}

function render() {
  ensureHost();
  root?.render(<MessageList list={items} />);
}

function beginLeave(id: string) {
  const found = items.find((i) => i.id === id);
  if (!found || found.leaving) return;
  items = items.map((i) => (i.id === id ? { ...i, leaving: true } : i));
  const t = timers.get(id);
  if (t) {
    window.clearTimeout(t);
    timers.delete(id);
  }
  render();
  window.setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    found.onClose?.();
    render();
  }, 160);
}

function remove(id: string) {
  beginLeave(id);
}

function isConfig(value: unknown): value is MessageConfig {
  return typeof value === "object" && value !== null && "content" in value;
}

function openTyped(type: MessageType, contentOrConfig: ReactNode | MessageConfig, duration?: number, onClose?: () => void) {
  const cfg: MessageConfig = isConfig(contentOrConfig)
    ? contentOrConfig
    : { content: contentOrConfig, duration, onClose };

  const id = String(cfg.key ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const resolvedType = cfg.type ?? type;
  const resolvedDuration = cfg.duration ?? (resolvedType === "loading" ? 0 : 3);

  const existingTimer = timers.get(id);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
    timers.delete(id);
  }

  items = [
    ...items.filter((i) => i.id !== id),
    {
      id,
      type: resolvedType,
      content: cfg.content,
      icon: cfg.icon,
      onClose: cfg.onClose,
      onClick: cfg.onClick,
      className: cfg.className,
      style: cfg.style,
    },
  ];
  render();

  if (resolvedDuration > 0) {
    const timerId = window.setTimeout(() => beginLeave(id), resolvedDuration * 1000);
    timers.set(id, timerId);
  }

  return () => remove(id);
}

function makeTypeOpen(type: MessageType): TypeOpen {
  return ((contentOrConfig: ReactNode | MessageConfig, duration?: number, onClose?: () => void) =>
    openTyped(type, contentOrConfig, duration, onClose)) as TypeOpen;
}

export const message = {
  open: (config: MessageConfig) => openTyped(config.type ?? "info", config),
  success: makeTypeOpen("success"),
  error: makeTypeOpen("error"),
  info: makeTypeOpen("info"),
  warning: makeTypeOpen("warning"),
  loading: makeTypeOpen("loading"),
  destroy: (key?: string | number) => {
    if (key != null) remove(String(key));
    else {
      for (const id of items.map((i) => i.id)) remove(id);
    }
  },
};
