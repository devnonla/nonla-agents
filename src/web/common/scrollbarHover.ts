const HIDE_DELAY_MS = 700;
const VISIBLE_CLASS = "scrollbar-visible";

const hideTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function isScrollContainer(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const { overflow, overflowX, overflowY } = getComputedStyle(el);
  return /(auto|scroll)/.test(`${overflow}${overflowX}${overflowY}`);
}

function findScrollContainer(start: EventTarget | null): HTMLElement | null {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.documentElement) {
    if (isScrollContainer(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function showScrollbar(el: HTMLElement) {
  const pending = hideTimers.get(el);
  if (pending) {
    clearTimeout(pending);
    hideTimers.delete(el);
  }
  el.classList.add(VISIBLE_CLASS);
}

function scheduleHideScrollbar(el: HTMLElement) {
  const pending = hideTimers.get(el);
  if (pending) clearTimeout(pending);
  hideTimers.set(
    el,
    setTimeout(() => {
      el.classList.remove(VISIBLE_CLASS);
      hideTimers.delete(el);
    }, HIDE_DELAY_MS),
  );
}

export function initScrollbarHover() {
  document.addEventListener(
    "pointerover",
    (e) => {
      const container = findScrollContainer(e.target);
      if (container) showScrollbar(container);
    },
    true,
  );

  document.addEventListener(
    "pointerout",
    (e) => {
      const container = findScrollContainer(e.target);
      if (!container) return;
      const related = e.relatedTarget;
      if (related instanceof Node && container.contains(related)) return;
      scheduleHideScrollbar(container);
    },
    true,
  );
}
