/**
 * Keep srcDoc site frames from navigating into the parent SPA (nested editor/public UI).
 * Hash / :target tabs stay in-document (no <base> — a base URL makes #frag leave about:srcdoc).
 */

function navGuardScript(publicPath: string): string {
  const pathJson = JSON.stringify(publicPath.startsWith("/") ? publicPath : `/${publicPath}`);
  return `<script data-ra-nav-guard data-site-path=${pathJson}>
(function () {
  var inspectOn = false;
  var sitePath = ${pathJson};

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "site-preview-inspect") inspectOn = !!e.data.enabled;
  });

  function resolveHref(href) {
    try {
      return new URL(href, "http://site.local" + sitePath);
    } catch (err) {
      return null;
    }
  }

  function isSameSite(url) {
    if (!url || !sitePath) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.pathname === sitePath || url.pathname === sitePath + "/";
  }

  document.addEventListener(
    "click",
    function (e) {
      if (inspectOn) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var t = e.target;
      var a = t && t.closest ? t.closest("a[href]") : null;
      if (!a) return;
      if (a.hasAttribute("download")) return;
      var target = (a.getAttribute("target") || "").toLowerCase();
      if (target === "_blank" || target === "_parent" || target === "_top") return;
      var href = (a.getAttribute("href") || "").trim();
      if (!href) {
        e.preventDefault();
        return;
      }
      // Fragment-only — native about:srcdoc hash / :target (do not touch).
      if (href.charAt(0) === "#") return;

      var url = resolveHref(href);
      if (!url) {
        e.preventDefault();
        return;
      }

      // Never leave about:srcdoc (would nest the host SPA).
      e.preventDefault();

      if (url.protocol === "mailto:" || url.protocol === "tel:") {
        window.open(url.href, "_blank", "noopener,noreferrer");
        return;
      }

      if (isSameSite(url)) {
        if (url.hash) {
          try {
            if (location.hash !== url.hash) location.hash = url.hash;
          } catch (err) {
            /* ignore */
          }
        }
        return;
      }

      if (url.protocol === "http:" || url.protocol === "https:") {
        window.open(url.href, "_blank", "noopener,noreferrer");
      }
    },
    true,
  );
})();
</script>`;
}

function appendBeforeBodyClose(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}</body>`);
  return `${html}${snippet}`;
}

/** Prepare SSR HTML for srcDoc: nav guard only (no <base> — breaks #hash tabs). */
export function injectSiteFrameBridge(html: string | null | undefined, publicPath: string): string {
  const base = html?.trim() ? html : "<p style='padding:16px;font-family:system-ui;color:#666'>Loading…</p>";
  if (!publicPath) return base;
  if (base.includes("data-ra-nav-guard")) return base;
  return appendBeforeBodyClose(base, navGuardScript(publicPath));
}

/** True when the iframe left about:srcdoc (SPA nested inside preview). */
export function isSrcDocFrameNavigatedAway(iframe: HTMLIFrameElement | null | undefined): boolean {
  if (!iframe) return false;
  try {
    const href = iframe.contentWindow?.location?.href ?? "";
    if (!href || href === "about:srcdoc") return false;
    if (href.startsWith("about:srcdoc")) return false;
    return true;
  } catch {
    return true;
  }
}
