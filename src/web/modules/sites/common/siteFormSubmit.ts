/** postMessage type: iframe → parent when a POST site form is submitted */
export const RA_SITE_FORM_SUBMIT = "ra-site-form-submit";

/** parent → iframe: disable forms while action runs */
export const RA_SITE_FORM_BUSY = "ra-site-form-busy";

/** iframe → parent when an in-document link / GET form would navigate the srcDoc frame */
export const RA_SITE_NAVIGATE = "ra-site-navigate";

export type RaSiteFormSubmitMessage = {
  type: typeof RA_SITE_FORM_SUBMIT;
  entries: [string, string][];
  path?: string;
};

export type RaSiteNavigateMessage = {
  type: typeof RA_SITE_NAVIGATE;
  href: string;
};

export type SiteActionResult = {
  ok?: boolean;
  message?: string;
  /** Default true — soft re-SSR after action. Set false for toast-only (e.g. validation). */
  reload?: boolean;
};

export type SiteNavigateDecision = { kind: "soft"; query: Record<string, string>; displayPath: string } | { kind: "external"; url: string } | { kind: "ignore" };

export function isRaSiteFormSubmitMessage(data: unknown): data is RaSiteFormSubmitMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.type !== RA_SITE_FORM_SUBMIT || !Array.isArray(d.entries)) return false;
  for (const entry of d.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    if (typeof entry[0] !== "string" || typeof entry[1] !== "string") return false;
  }
  if (d.path !== undefined && typeof d.path !== "string") return false;
  return true;
}

export function isRaSiteNavigateMessage(data: unknown): data is RaSiteNavigateMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === RA_SITE_NAVIGATE && typeof d.href === "string";
}

/** Classify an iframe href relative to the site public path (avoid nesting the SPA in srcDoc). */
export function resolveSiteNavigate(href: string, publicPath: string, origin: string): SiteNavigateDecision {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return { kind: "ignore" };

  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  const base = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);

  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return { kind: "ignore" };
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return { kind: "external", url: url.href };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "ignore" };
  }

  const sameSitePath = url.pathname === path || url.pathname === `${path}/`;
  if (url.origin === origin && sameSitePath) {
    return {
      kind: "soft",
      query: Object.fromEntries(url.searchParams.entries()),
      displayPath: `${path}${url.search}${url.hash}`,
    };
  }

  return { kind: "external", url: url.href };
}

export function formDataFromEntries(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) {
    fd.append(key, value);
  }
  return fd;
}

export function shouldReloadAfterAction(result: SiteActionResult | undefined): boolean {
  return result?.reload !== false;
}

export function isAllowedSiteFormMessageOrigin(origin: string): boolean {
  // srcDoc iframes report opaque origin "null"; trust event.source === iframe.contentWindow instead.
  return origin === window.location.origin || origin === "null";
}

export function postSiteFormBusy(iframe: HTMLIFrameElement | null | undefined, busy: boolean) {
  // "*" required: srcDoc contentWindow often has opaque origin and rejects parent origin as target.
  iframe?.contentWindow?.postMessage({ type: RA_SITE_FORM_BUSY, busy }, "*");
}
