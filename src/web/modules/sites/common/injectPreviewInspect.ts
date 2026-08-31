export const SITE_PREVIEW_SELECT = "site-preview-select";
export const SITE_PREVIEW_INSPECT = "site-preview-inspect";

export type SitePreviewSelection = {
  tagName: string;
  id?: string;
  className?: string;
  cssPath: string;
  text: string;
  outerHtml: string;
  sourceAnchor?: string;
  /** Filled after resolve-selection API */
  file?: string;
  line?: number;
  jsxExcerpt?: string;
  matchMethod?: "anchor" | "fuzzy" | "none";
};

export function isSitePreviewSelectionMessage(data: unknown): data is { type: typeof SITE_PREVIEW_SELECT } & SitePreviewSelection {
  return typeof data === "object" && data !== null && (data as { type?: string }).type === SITE_PREVIEW_SELECT && typeof (data as { tagName?: unknown }).tagName === "string" && typeof (data as { cssPath?: unknown }).cssPath === "string";
}

const INSPECT_SCRIPT = `
<script data-nonla-agents-inspect>
(function () {
  var STYLE_ID = "nonla-agents-inspect-style";
  var enabled = false;
  var hoverEl = null;
  var selectedEl = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".ra-inspect-hover{outline:2px solid #3b82f6!important;outline-offset:2px!important;cursor:crosshair!important;}" +
      ".ra-inspect-selected{outline:2px solid #f59e0b!important;outline-offset:2px!important;}";
    document.head.appendChild(style);
  }

  function truncate(s, n) {
    s = String(s || "").replace(/\\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function findSourceAnchor(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var a = cur.getAttribute("data-ra");
      if (a) return a;
      cur = cur.parentElement;
    }
    return undefined;
  }

  function stripRaAttrs(html) {
    return String(html || "").replace(/\\s*data-ra="[^"]*"/g, "");
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
      var part = cur.tagName.toLowerCase();
      if (cur.id) {
        part += "#" + cur.id;
        parts.unshift(part);
        break;
      }
      if (cur.classList && cur.classList.length) {
        var cls = Array.prototype.filter.call(cur.classList, function (c) {
          return c !== "ra-inspect-hover" && c !== "ra-inspect-selected";
        }).slice(0, 2).join(".");
        if (cls) part += "." + cls;
      }
      var parent = cur.parentElement;
      if (parent) {
        var same = 0;
        var idx = 0;
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === cur.tagName) {
            same++;
            if (parent.children[i] === cur) idx = same;
          }
        }
        if (same > 1) part += ":nth-of-type(" + idx + ")";
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function clearHover() {
    if (hoverEl) {
      hoverEl.classList.remove("ra-inspect-hover");
      hoverEl = null;
    }
  }

  function clearSelected() {
    if (selectedEl) {
      selectedEl.classList.remove("ra-inspect-selected");
      selectedEl = null;
    }
  }

  function setEnabled(next) {
    enabled = !!next;
    ensureStyle();
    document.documentElement.style.cursor = enabled ? "crosshair" : "";
    if (!enabled) {
      clearHover();
    }
  }

  function onMove(e) {
    if (!enabled) return;
    var t = e.target;
    if (!t || t === document.documentElement || t === document.body) {
      clearHover();
      return;
    }
    if (t === hoverEl) return;
    clearHover();
    if (t !== selectedEl) {
      t.classList.add("ra-inspect-hover");
      hoverEl = t;
    }
  }

  function onClick(e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    clearHover();
    clearSelected();
    t.classList.remove("ra-inspect-hover", "ra-inspect-selected");
    var path = cssPath(t);
    var cls = t.className && typeof t.className === "string"
      ? t.className.replace(/\\bra-inspect-(hover|selected)\\b/g, "").trim() || undefined
      : undefined;
    var html = truncate(stripRaAttrs(t.outerHTML || ""), 800);
    var text = truncate(t.innerText || t.textContent || "", 160);
    var sourceAnchor = findSourceAnchor(t);
    t.classList.add("ra-inspect-selected");
    selectedEl = t;
    parent.postMessage({
      type: "site-preview-select",
      tagName: t.tagName.toLowerCase(),
      id: t.id || undefined,
      className: cls,
      cssPath: path,
      text: text,
      outerHtml: html,
      sourceAnchor: sourceAnchor,
    }, "*");
  }

  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "site-preview-inspect") {
      setEnabled(!!data.enabled);
      if (!data.enabled) clearSelected();
    }
  });

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
})();
</script>
`;

/** Inject editor-only inspect script into SSR HTML for srcDoc preview. */
export function injectPreviewInspect(html: string | null | undefined): string {
  const base = html?.trim() ? html : "<p style='padding:16px;font-family:system-ui;color:#666'>Loading preview…</p>";
  if (base.includes("data-nonla-agents-inspect")) return base;
  if (/<\/body>/i.test(base)) {
    return base.replace(/<\/body>/i, `${INSPECT_SCRIPT}</body>`);
  }
  return `${base}${INSPECT_SCRIPT}`;
}

export function formatSelectionContext(sel: SitePreviewSelection): string {
  const lines = ["<selected_element>"];
  if (sel.sourceAnchor) lines.push(`sourceAnchor: ${sel.sourceAnchor}`);
  if (sel.file) lines.push(`file: ${sel.file}`);
  if (sel.line) lines.push(`line: ${sel.line}`);
  if (sel.matchMethod) lines.push(`matchMethod: ${sel.matchMethod}`);
  lines.push(`cssPath: ${sel.cssPath}`, `tag: ${sel.tagName}`);
  if (sel.id) lines.push(`id: ${sel.id}`);
  if (sel.className) lines.push(`class: ${sel.className}`);
  if (sel.text) lines.push(`text: ${JSON.stringify(sel.text)}`);
  if (sel.outerHtml) lines.push(`outerHtml: ${sel.outerHtml}`);
  if (sel.jsxExcerpt) {
    lines.push("jsxExcerpt (edit this region in the source file — line numbers on the left):");
    lines.push(sel.jsxExcerpt);
  }
  lines.push("</selected_element>");
  lines.push("Prefer sourceAnchor + jsxExcerpt over cssPath when editing app.tsx.");
  return lines.join("\n");
}

export function selectionLabel(sel: SitePreviewSelection): string {
  const tag = sel.tagName.toLowerCase();
  let base = tag;
  if (sel.id) {
    base += `#${sel.id}`;
  } else if (sel.className) {
    const classes = sel.className
      .trim()
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("ra-inspect"))
      .slice(0, 2);
    if (classes.length) base += `.${classes.join(".")}`;
  }
  const text = sel.text?.replace(/\s+/g, " ").trim();
  if (text) {
    const short = text.length > 36 ? `${text.slice(0, 36)}…` : text;
    return `${base} “${short}”`;
  }
  return base;
}
