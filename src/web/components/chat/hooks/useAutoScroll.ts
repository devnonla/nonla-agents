import { useCallback, useEffect, useRef } from "react";

/**
 * useAutoScroll — stick-to-bottom for chat scroll containers.
 *
 * Unpin only on intentional user scroll-up (wheel/touch). Programmatic sticks
 * set a short grace window so trackpad rubber-band / layout noise cannot latch
 * `userScrolledUp` and kill follow mid-stream.
 */
export function useAutoScroll(opts?: {
  threshold?: number;
  onScrolledUpChange?: (scrolledUp: boolean) => void;
}) {
  const threshold = opts?.threshold ?? 10;
  const onScrolledUpChangeRef = useRef(opts?.onScrolledUpChange);
  onScrolledUpChangeRef.current = opts?.onScrolledUpChange;

  const elRef = useRef<HTMLElement | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const wheelListenerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const touchStartYRef = useRef(0);
  const touchListenerRef = useRef<{ start: (e: TouchEvent) => void; move: (e: TouchEvent) => void } | null>(null);

  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const stickGraceUntilRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const observedChildRef = useRef<Element | null>(null);

  const checkNearBottom = (el: HTMLElement): boolean => el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

  const setScrolledUp = useCallback((value: boolean) => {
    if (userScrolledUpRef.current === value) return;
    userScrolledUpRef.current = value;
    onScrolledUpChangeRef.current?.(value);
  }, []);

  const setup = useCallback(
    (el: HTMLElement) => {
      const markProgrammatic = () => {
        programmaticScrollRef.current = true;
        stickGraceUntilRef.current = performance.now() + 120;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
          });
        });
      };

      const stickToBottom = () => {
        if (userScrolledUpRef.current) return;

        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        if (Math.abs(el.scrollTop - maxScroll) < 1) return;

        markProgrammatic();
        el.scrollTop = maxScroll;
      };

      const isNestedScroller = (target: EventTarget | null): boolean => {
        if (!(target instanceof Element)) return false;
        let node: Element | null = target;
        while (node && node !== el) {
          if (node instanceof HTMLElement) {
            const { overflowY } = getComputedStyle(node);
            if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
              return true;
            }
          }
          node = node.parentElement;
        }
        return false;
      };

      const canUnpin = () => {
        if (programmaticScrollRef.current) return false;
        if (performance.now() < stickGraceUntilRef.current) return false;
        return true;
      };

      const handleScroll = () => {
        if (programmaticScrollRef.current) return;
        if (checkNearBottom(el)) setScrolledUp(false);
      };

      const handleWheel = (e: WheelEvent) => {
        if (isNestedScroller(e.target)) return;

        if (e.deltaY < -2) {
          if (!canUnpin()) return;
          requestAnimationFrame(() => {
            if (!canUnpin()) return;
            if (!checkNearBottom(el)) setScrolledUp(true);
          });
        } else if (e.deltaY > 2 && checkNearBottom(el)) {
          setScrolledUp(false);
        }
      };

      const handleTouchStart = (e: TouchEvent) => {
        touchStartYRef.current = e.touches[0]?.clientY ?? 0;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (isNestedScroller(e.target)) return;
        const y = e.touches[0]?.clientY ?? 0;
        const dy = y - touchStartYRef.current;
        if (dy > 10) {
          if (!canUnpin()) return;
          requestAnimationFrame(() => {
            if (!canUnpin()) return;
            if (!checkNearBottom(el)) setScrolledUp(true);
          });
        } else if (dy < -10 && checkNearBottom(el)) {
          setScrolledUp(false);
        }
      };

      const observeContentChild = (observer: ResizeObserver) => {
        const content = el.querySelector<HTMLElement>("[data-chat-scroll-content]") ?? (el.firstElementChild instanceof HTMLElement ? el.firstElementChild : null);
        if (!content) return;
        if (observedChildRef.current === content) return;
        if (observedChildRef.current) {
          try {
            observer.unobserve(observedChildRef.current);
          } catch {
            /* already gone */
          }
        }
        observedChildRef.current = content;
        observer.observe(content);
      };

      const resizeObserver = new ResizeObserver(() => {
        observeContentChild(resizeObserver);
        stickToBottom();
      });
      resizeObserver.observe(el);
      observeContentChild(resizeObserver);

      const scheduleFollow = () => {
        if (userScrolledUpRef.current) return;
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          observeContentChild(resizeObserver);
          stickToBottom();
        });
      };

      const mutationObserver = new MutationObserver(scheduleFollow);
      mutationObserver.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      el.addEventListener("scroll", handleScroll, { passive: true });
      el.addEventListener("wheel", handleWheel, { passive: true });
      el.addEventListener("touchstart", handleTouchStart, { passive: true });
      el.addEventListener("touchmove", handleTouchMove, { passive: true });

      setScrolledUp(false);
      stickToBottom();

      mutationObserverRef.current = mutationObserver;
      resizeObserverRef.current = resizeObserver;
      scrollListenerRef.current = handleScroll;
      wheelListenerRef.current = handleWheel;
      touchListenerRef.current = { start: handleTouchStart, move: handleTouchMove };
    },
    [threshold, setScrolledUp],
  );

  const teardown = useCallback((el: HTMLElement) => {
    mutationObserverRef.current?.disconnect();
    mutationObserverRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    observedChildRef.current = null;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (scrollListenerRef.current) {
      el.removeEventListener("scroll", scrollListenerRef.current);
      scrollListenerRef.current = null;
    }
    if (wheelListenerRef.current) {
      el.removeEventListener("wheel", wheelListenerRef.current);
      wheelListenerRef.current = null;
    }
    if (touchListenerRef.current) {
      el.removeEventListener("touchstart", touchListenerRef.current.start);
      el.removeEventListener("touchmove", touchListenerRef.current.move);
      touchListenerRef.current = null;
    }
  }, []);

  const scrollRef = useCallback(
    (node: HTMLElement | null) => {
      if (elRef.current) teardown(elRef.current);
      elRef.current = node;
      if (node) setup(node);
    },
    [setup, teardown],
  );

  useEffect(() => {
    return () => {
      if (elRef.current) {
        teardown(elRef.current);
        elRef.current = null;
      }
    };
  }, [teardown]);

  const scrollToBottom = useCallback(
    (opts?: { force?: boolean }) => {
      const el = elRef.current;
      if (!el) return;
      if (!opts?.force && userScrolledUpRef.current) return;

      setScrolledUp(false);
      programmaticScrollRef.current = true;
      stickGraceUntilRef.current = performance.now() + 120;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    },
    [setScrolledUp],
  );

  const forceFollow = useCallback(() => {
    setScrolledUp(false);
  }, [setScrolledUp]);

  return { scrollRef, scrollToBottom, forceFollow };
}
