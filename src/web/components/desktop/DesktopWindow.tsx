import { type MouseEvent as ReactMouseEvent, type ReactNode, type PointerEvent as ReactPointerEvent, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Phase = "open" | "leaving";
type Size = { w: number; h: number };
type Point = { x: number; y: number };

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.closest(".monaco-editor"));
}

function originFromActiveIcon(overlay: HTMLElement, frame: HTMLElement) {
  const source = document.querySelector('[aria-current="true"]');
  if (!(source instanceof HTMLElement)) return "50% 50%";

  const icon = source.getBoundingClientRect();
  const overlayBox = overlay.getBoundingClientRect();
  const x = icon.left + icon.width / 2 - overlayBox.left - frame.offsetLeft;
  const y = icon.top + icon.height / 2 - overlayBox.top - frame.offsetTop;
  return `${x}px ${y}px`;
}

function compactSize(view: Size): Size {
  return {
    w: Math.min(window.innerWidth * 0.8, view.w),
    h: Math.max(0, view.h - 80),
  };
}

function clampOffset(view: Size, compact: Size, next: Point) {
  const maxX = Math.max(0, (view.w - compact.w) / 2);
  const maxY = Math.max(0, (view.h - compact.h) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, next.x)),
    y: Math.min(maxY, Math.max(-maxY, next.y)),
  };
}

function collapsedRect(view: Size, offset: Point) {
  const compact = compactSize(view);
  const clamped = clampOffset(view, compact, offset);
  return {
    x: (view.w - compact.w) / 2 + clamped.x,
    y: (view.h - compact.h) / 2 + clamped.y,
    w: compact.w,
    h: compact.h,
  };
}

function GlyphClose() {
  return (
    <svg width="7" height="7" viewBox="0 0 6 6" aria-hidden className="block">
      <path d="M1.1 1.1l3.8 3.8M4.9 1.1L1.1 4.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function GlyphExpand({ restore }: { restore?: boolean }) {
  if (restore) {
    return (
      <svg width="7" height="7" viewBox="0 0 6 6" aria-hidden className="block">
        <path d="M1.1 2.4V.9H2.6M4.9 3.6v1.5H3.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="7" height="7" viewBox="0 0 6 6" aria-hidden className="block">
      <path d="M.8 3.4V.8H3.4zM5.2 2.6v2.6H2.6z" fill="currentColor" />
    </svg>
  );
}

function TrafficLight({
  label,
  onClick,
  shortcut,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  shortcut?: string;
  tone: "close" | "expand";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      className={`inline-flex size-3.5 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-full border-0 p-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${tone === "close" ? "bg-[#ff5f57] text-[#7a1210]" : "bg-[#28c840] text-[#0d5c18]"}`}
    >
      <span className="flex opacity-0 transition-opacity duration-75 group-hover/traffic:opacity-100 group-focus-within/traffic:opacity-100">{children}</span>
    </button>
  );
}

type WindowHeaderSlot = {
  slot: HTMLElement | null;
  setCustom: (on: boolean) => void;
};

const WindowHeaderSlotContext = createContext<WindowHeaderSlot | null>(null);

export function WindowHeader({ children }: { children: ReactNode }) {
  const ctx = useContext(WindowHeaderSlotContext);
  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.setCustom(true);
    return () => ctx.setCustom(false);
  }, [ctx]);
  if (!ctx?.slot) return null;
  return createPortal(children, ctx.slot);
}

export function DesktopWindow({
  title,
  expanded,
  onClose,
  onToggleExpand,
  children,
}: {
  title?: ReactNode;
  expanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const closedRef = useRef(false);
  const expandedRef = useRef(expanded);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<Size>(() => ({
    w: window.innerWidth,
    h: Math.max(0, window.innerHeight - 56),
  }));
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [customHeader, setCustomHeader] = useState(false);
  const headerChrome = useMemo(() => ({ slot: headerSlot, setCustom: setCustomHeader }), [headerSlot]);
  const requestCloseRef = useRef<() => void>(() => {});
  expandedRef.current = expanded;

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const frame = frameRef.current;
    if (overlay && frame) {
      frame.style.transformOrigin = originFromActiveIcon(overlay, frame);
    }
  }, []);

  const requestClose = () => {
    if (closedRef.current || phase === "leaving") return;
    if (prefersReducedMotion()) {
      closedRef.current = true;
      onClose();
      return;
    }
    setPhase("leaving");
  };
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onClose();
    }, 280);
    return () => window.clearTimeout(t);
  }, [phase, onClose]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const sync = () => {
      const next = { w: overlay.clientWidth, h: overlay.clientHeight };
      setView((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
      if (expandedRef.current) return;
      setOffset((current) => {
        const clamped = clampOffset(next, compactSize(next), current);
        if (clamped.x === current.x && clamped.y === current.y) return current;
        return clamped;
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isEditableTarget(e.target)) return;
      e.preventDefault();
      requestCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (expanded || phase === "leaving") return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-captured pointers can throw; drag still works via move/up.
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const onDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!dragging && dx * dx + dy * dy < 16) return;
    if (!dragging) setDragging(true);
    setOffset(
      clampOffset(view, compactSize(view), {
        x: drag.origX + dx,
        y: drag.origY + dy,
      }),
    );
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onTitleBarDoubleClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (phase === "leaving") return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
    e.preventDefault();
    dragRef.current = null;
    setDragging(false);
    onToggleExpand();
  };

  const visible = phase === "open";
  const leaving = phase === "leaving";
  const rect = expanded ? { x: 0, y: 0, w: view.w, h: view.h } : collapsedRect(view, offset);
  const reduce = prefersReducedMotion();
  const duration = reduce ? "150ms" : "300ms";
  const geom = !dragging && !leaving && !reduce ? `top ${duration} ${EASE}, left ${duration} ${EASE}, width ${duration} ${EASE}, height ${duration} ${EASE}` : "";
  const fade = leaving && !reduce ? `opacity ${duration} ${EASE}, transform ${duration} ${EASE}` : "";

  return (
    <WindowHeaderSlotContext.Provider value={headerChrome}>
      <div ref={overlayRef} className="absolute top-10.5 inset-x-0 bottom-0 z-30 pointer-events-none">
        <section
          ref={frameRef}
          aria-label={typeof title === "string" && title ? title : "Window"}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (phase !== "leaving") return;
            if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
            if (closedRef.current) return;
            closedRef.current = true;
            onClose();
          }}
          style={{
            top: rect.y,
            left: rect.x,
            width: rect.w,
            height: rect.h,
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1)" : "scale(0.18)",
            transition: [geom, fade].filter(Boolean).join(", ") || undefined,
          }}
          data-expanded={expanded || undefined}
          className={`absolute flex flex-col overflow-hidden rounded-xl pointer-events-auto border border-[rgb(255_248_230/0.5)] bg-[rgb(247_244_232/0.85)] backdrop-blur-xl transform-gpu ${leaving ? "pointer-events-none" : ""}`}
        >
          <header onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onDoubleClick={onTitleBarDoubleClick} className="flex h-8 shrink-0 cursor-default items-center gap-4 border-0 border-b border-solid border-[rgb(255_248_230/0.45)] px-3 select-none touch-none">
            <div className="group/traffic flex shrink-0 items-center gap-2">
              <TrafficLight label="Close window" tone="close" onClick={requestClose} shortcut="Esc">
                <GlyphClose />
              </TrafficLight>
              <TrafficLight label={expanded ? "Restore window" : "Expand window"} tone="expand" onClick={onToggleExpand} shortcut="Shift + ↑">
                <GlyphExpand restore={expanded} />
              </TrafficLight>
            </div>
            <div className="flex min-w-0 flex-1 items-center">
              {customHeader ? null : typeof title === "string" ? <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-foreground/90">{title}</span> : title}
              <div ref={setHeaderSlot} className="contents" />
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </section>
      </div>
    </WindowHeaderSlotContext.Provider>
  );
}
