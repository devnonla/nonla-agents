import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import rootPkg from "../../../package.json" with { type: "json" };
import { HttpException } from "./common/exceptions/http.exception.js";
import { clearSiteAccessTokenCookieHeader, parseCookieValue, resolveAuth, siteAccessTokenCookieHeader, siteTokenCookieName } from "./common/middleware/auth.middleware.js";
import { buildSpaHtml, requestOrigin } from "./common/spa-html.js";

import agentsRoute from "./modules/agents/agents.route.js";
import conversationsRoute from "./modules/conversations/conversations.route.js";
import datatablesRoute from "./modules/datatables/datatables.route.js";
import jobsRoute from "./modules/jobs/jobs.route.js";
import kvstoreRoute from "./modules/kvstore/kvstore.route.js";
import providersRoute from "./modules/llm-providers/llm-providers.route.js";
import mcpServersRoute from "./modules/mcp-servers/mcp-servers.route.js";
import mcpHttpRoute from "./modules/my-mcp-servers/mcp-http.route.js";
import myMcpServersRoute from "./modules/my-mcp-servers/my-mcp-servers.route.js";
import ogRoute from "./modules/og/og.route.js";
import publicRoute from "./modules/public/public.route.js";
import secretsRoute from "./modules/secrets/secrets.route.js";
import settingsRoute from "./modules/settings/settings.route.js";
import sitesRoute from "./modules/sites/sites.route.js";
import { getPublicSiteAsset, renderPublicSiteDocument } from "./modules/sites/sites.service.js";
import skillsRoute from "./modules/skills/skills.route.js";
import statsRoute from "./modules/stats/stats.route.js";
import teamsRoute from "./modules/teams/teams.route.js";
import toolFoldersRoute from "./modules/tool-folders/tool-folders.route.js";
import toolsRoute from "./modules/tools/tools.route.js";

import apiKeysRoute from "./modules/api-keys/api-keys.route.js";
import authRoute from "./modules/auth/auth.route.js";
import usersRoute from "./modules/users/users.route.js";
import v1Route from "./modules/v1/v1.route.js";

const APP_VERSION = rootPkg.version;

type SpaBuildMeta = { buildId: string; version: string };

/** Cache headers for production SPA static files. */
function spaAssetCacheControl(reqPath: string): string {
  // Vite content-hashed bundles — safe to cache forever
  if (reqPath.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  // OG image is hot-linked by chatrooms
  if (reqPath === "/og-image.png") {
    return "public, max-age=86400";
  }
  // favicon / build-meta.json / other unhashed public files — always revalidate
  return "no-cache";
}

/** Read build fingerprint written by Vite into web dist (same id baked into the SPA). */
function loadSpaBuildMeta(webDist: string | undefined): SpaBuildMeta {
  const fallback: SpaBuildMeta = { buildId: "dev", version: APP_VERSION };
  if (!webDist) return fallback;
  const metaPath = `${webDist}/build-meta.json`;
  if (!existsSync(metaPath)) return fallback;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Partial<SpaBuildMeta>;
    if (typeof raw.buildId === "string" && raw.buildId.trim()) {
      return {
        buildId: raw.buildId.trim(),
        version: typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : APP_VERSION,
      };
    }
  } catch {
    /* ignore malformed meta */
  }
  return fallback;
}

function siteAccessFromRequest(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } }, slug: string) {
  const auth = c.req.header("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const headerToken = c.req.header("x-site-access-token")?.trim();
  const queryToken = c.req.query("token")?.trim() || c.req.query("site_token")?.trim();
  const cookieToken = parseCookieValue(c.req.header("Cookie"), siteTokenCookieName(slug)) ?? undefined;
  return {
    token: bearer || headerToken || queryToken || cookieToken || undefined,
  };
}

export function createApp(): Hono {
  const app = new Hono();

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use("*", logger());
  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(
    "/mcp/*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version", "Mcp-Session-Id"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      exposeHeaders: ["Mcp-Session-Id", "MCP-Protocol-Version"],
    }),
  );

  // ── Auth middleware — resolve JWT on all /api/* routes ─────────────────────
  app.use("/api/*", resolveAuth);

  // ── Global error handler (NestJS-style exceptions) ────────────────────────
  app.onError((err, c) => {
    if (err instanceof HttpException) {
      return c.json({ code: err.statusCode, message: err.message }, err.statusCode as any);
    }
    console.error("[Unhandled]", err);
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  // ── API Routes ─────────────────────────────────────────────────────────────
  // Auth routes (login is public, me/change-password check auth internally)
  app.route("/api/auth", authRoute);

  app.route("/api/agents", agentsRoute);
  app.route("/api/conversations", conversationsRoute);
  app.route("/api/tools", toolsRoute);
  app.route("/api/tool-folders", toolFoldersRoute);
  app.route("/api/skills", skillsRoute);
  app.route("/api/providers", providersRoute);
  app.route("/api/mcp-servers", mcpServersRoute);
  app.route("/api/my-mcp-servers", myMcpServersRoute);
  app.route("/api/kvstore", kvstoreRoute);
  app.route("/api/datatables", datatablesRoute);
  app.route("/api/sites", sitesRoute);
  app.route("/api/secrets", secretsRoute);
  app.route("/api/jobs", jobsRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/teams", teamsRoute);
  app.route("/api/stats", statsRoute);

  app.route("/api/users", usersRoute);

  app.route("/api/api-keys", apiKeysRoute);
  app.route("/api/v1", v1Route);

  app.route("/api/public", publicRoute);
  app.route("/api/og", ogRoute);

  // ── Public MCP (Streamable HTTP) — before SPA fallback ─────────────────────
  app.route("/mcp", mcpHttpRoute);

  // ── Public site documents (real HTML + assets — before SPA fallback) ───────
  app.get("/public/sites/:slug", async (c) => {
    const slug = c.req.param("slug");
    const legacyToken = c.req.query("site_token")?.trim() || c.req.query("token")?.trim();
    // Strip legacy ?site_token= from URL; persist via HttpOnly cookie instead.
    if (legacyToken) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/public/sites/${encodeURIComponent(slug)}`,
          "Set-Cookie": siteAccessTokenCookieHeader(slug, legacyToken),
          "Cache-Control": "no-store",
        },
      });
    }

    const access = siteAccessFromRequest(c, slug);
    try {
      const doc = await renderPublicSiteDocument(slug, c.req.raw, access);
      const headers: Record<string, string> = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      };
      if (doc.kind === "unlock") {
        headers["Set-Cookie"] = clearSiteAccessTokenCookieHeader(slug);
      }
      return new Response(doc.html, { headers });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") || message.includes("Not found") ? 404 : 500;
      return new Response(`<!DOCTYPE html><pre style="padding:16px">${message}</pre>`, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  });

  app.get("/public/sites/:slug/assets/:file", async (c) => {
    const slug = c.req.param("slug");
    const access = siteAccessFromRequest(c, slug);
    const file = c.req.param("file");
    if (file !== "app.js" && file !== "styles.css") return c.json({ message: "Not found" }, 404);
    try {
      const asset = await getPublicSiteAsset(slug, file, access);
      return new Response(asset.body, {
        headers: { "Content-Type": asset.contentType, "Cache-Control": "no-store" },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /password|unauthorized/i.test(message) ? 401 : /not found/i.test(message) ? 404 : 500;
      return c.json({ message }, status);
    }
  });

  // ── Serve web build (SPA) ──────────────────────────────────────────────────
  const webDistPaths = [`${import.meta.dir}/../../web/dist`, `${import.meta.dir}/../public`];

  const webDist = webDistPaths.find((p) => existsSync(`${p}/index.html`));
  const spaBuildMeta = loadSpaBuildMeta(webDist);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get("/api/health", async (c) =>
    c.json({
      ok: true,
      app: "nonla-agents",
      version: spaBuildMeta.version,
      buildId: spaBuildMeta.buildId,
      runtime: "bun",
    }),
  );

  if (webDist) {
    // Unified static handler:
    // - Real files in dist/ (JS, CSS, favicon, og-image, …) are served as-is
    // - Everything else → index.html SPA fallback with absolute OG/Twitter meta
    //   (required for /chat/:id link previews — crawlers don't run React)
    const indexPath = `${webDist}/index.html`;
    app.get("*", async (c) => {
      const reqPath = c.req.path;
      const filePath = `${webDist}${reqPath}`;
      if (reqPath !== "/" && (await Bun.file(filePath).exists())) {
        const res = new Response(Bun.file(filePath));
        res.headers.set("Cache-Control", spaAssetCacheControl(reqPath));
        return res;
      }

      const baseHtml = await Bun.file(indexPath).text();
      const html = await buildSpaHtml(baseHtml, {
        origin: requestOrigin(c.req.raw),
        path: reqPath,
      });
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Never cache the SPA shell — new deploys must pick up new asset hashes
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    });
  } else {
    app.get("/", async (c) =>
      c.json({
        ok: true,
        app: "nonla-agents",
        message: "Web UI not built yet.",
      }),
    );
  }

  return app;
}
