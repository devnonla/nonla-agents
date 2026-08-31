/**
 * SPA HTML helpers — inject absolute Open Graph / Twitter meta so link previews
 * (Slack, iMessage, Discord, Facebook, …) work when sharing /chat/:id.
 *
 * Crawlers do not execute React; tags must be in the HTML response itself.
 */

import { eq } from "drizzle-orm";
import { agents, getDb, sites } from "./db/client.js";

const DEFAULT_TITLE = "Nonla Agents";
const DEFAULT_DESCRIPTION = "Nonla Agents — AI Agent Management Platform";
const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Resolve public origin, honouring reverse-proxy forwarded headers. */
export function requestOrigin(req: Request): string {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (xfHost) {
    const proto = (xfProto?.split(",")[0]?.trim() || "https").replace(/:$/, "");
    return `${proto}://${xfHost.split(",")[0].trim()}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function isHttpOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Public base URL for absolute links in prompts / OG / share URLs.
 * Priority: PUBLIC_BASE_URL (or PUBLIC_URL) env → client origin → requestOrigin (X-Forwarded-* / Host).
 */
export function resolvePublicBaseUrl(opts: { request?: Request; clientOrigin?: string | null } = {}): string {
  const fromEnv = normalizeBaseUrl(process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_URL ?? "");
  if (fromEnv && isHttpOrigin(fromEnv)) return fromEnv;

  const fromClient = normalizeBaseUrl(opts.clientOrigin ?? "");
  if (fromClient && isHttpOrigin(fromClient)) return fromClient;

  if (opts.request) {
    const fromReq = normalizeBaseUrl(requestOrigin(opts.request));
    if (fromReq && isHttpOrigin(fromReq)) return fromReq;
  }

  return "";
}

function loadPublicChatOg(agentId: string): { title: string; description: string } | null {
  try {
    const db = getDb();
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent?.isPublic) return null;
    const name = agent.name?.trim() || "AI Agent";
    const title = `${name} · Nonla Agents`;
    const description = (agent.description?.trim() || `Chat with ${name} on Nonla Agents.`).slice(0, 300);
    return { title, description };
  } catch {
    return null;
  }
}

function loadPublicSiteOg(slug: string): { title: string; description: string } | null {
  try {
    const db = getDb();
    const site = db.select().from(sites).where(eq(sites.slug, slug.trim().toLowerCase())).get();
    if (!site?.isPublished) return null;
    const name = site.name?.trim() || "Site";
    return {
      title: `${name} · Nonla Agents`,
      description: `Published site on Nonla Agents · /public/sites/${site.slug}`,
    };
  } catch {
    return null;
  }
}

export function ogMetaTags(opts: { title: string; description: string; pageUrl: string; imageUrl: string }): string {
  const t = escapeHtml(opts.title);
  const d = escapeHtml(opts.description);
  const u = escapeHtml(opts.pageUrl);
  const img = escapeHtml(opts.imageUrl);
  return [
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Nonla Agents" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${t}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join("\n    ");
}

/**
 * Rewrite index.html with absolute OG/Twitter tags.
 * For `/chat/:agentId` and `/public/sites/:slug`, title/description/image come from the public entity.
 */
export function buildSpaHtml(baseHtml: string, opts: { origin: string; path: string }): string {
  const origin = opts.origin.replace(/\/$/, "");
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const pageUrl = `${origin}${path === "/" ? "/" : path}`;
  let imageUrl = `${origin}${OG_IMAGE_PATH}`;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;

  const chatMatch = path.match(/^\/chat\/([^/?#]+)\/?$/);
  if (chatMatch) {
    const agentId = decodeURIComponent(chatMatch[1]);
    const meta = loadPublicChatOg(agentId);
    if (meta) {
      title = meta.title;
      description = meta.description;
      imageUrl = `${origin}/api/og/chat/${encodeURIComponent(agentId)}.png`;
    }
  }

  const siteMatch = path.match(/^\/public\/sites\/([^/?#]+)\/?$/);
  if (siteMatch) {
    const slug = decodeURIComponent(siteMatch[1]);
    const meta = loadPublicSiteOg(slug);
    if (meta) {
      title = meta.title;
      description = meta.description;
      imageUrl = `${origin}/api/og/sites/${encodeURIComponent(slug)}.png`;
    }
  }

  const html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");

  const tags = [`<title>${escapeHtml(title)}</title>`, ogMetaTags({ title, description, pageUrl, imageUrl })].join("\n    ");

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }
  return `${tags}\n${html}`;
}
