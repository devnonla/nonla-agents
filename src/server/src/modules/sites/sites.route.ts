import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException, NotFoundException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { accessTokenCookieHeader, readAccessToken, requireAuth } from "../../common/middleware/auth.middleware.js";
import { type SiteAgentStreamRequest, streamSiteAgent } from "./services/site-agent.service.js";
import * as svc from "./sites.service.js";

const app = new Hono();

app.use("*", requireAuth);

function authUser(c: { get: (k: string) => unknown }): svc.SiteActor {
  return c.get("user") as svc.SiteActor;
}

app.get("/", async (c) => c.json(await svc.listSites(c.req.query(), authUser(c))));

app.post("/", async (c) => {
  const body = await c.req.json<{ name?: string; slug?: string }>();
  const user = authUser(c);
  return c.json(await svc.createSite({ ...body, createdBy: user.id }), 201);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  return c.json(await svc.getSite(id));
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json();
  return c.json(await svc.updateSite(id, body));
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  return c.json(await svc.deleteSite(id));
});

app.get("/:id/files", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const tree = c.req.query("tree") === "prod" ? "prod" : "draft";
  return c.json(await svc.getSiteFiles(id, tree));
});

app.put("/:id/files/:file", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json<{ content?: string; tree?: string }>();
  if (typeof body.content !== "string") throw new BadRequestException("content is required");
  if (body.tree === "prod") {
    throw new BadRequestException("Cannot write production files directly; edit draft and approve");
  }
  return c.json(await svc.updateSiteFile(id, c.req.param("file"), body.content, "draft"));
});

app.post("/:id/install", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { tree?: string };
  const tree = body.tree === "prod" ? "prod" : "draft";
  return c.json(await svc.installDeps(id, tree));
});

app.post("/:id/preview", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { query?: Record<string, string>; tree?: string };
  const tree = body.tree === "prod" ? "prod" : "draft";
  try {
    const result = await svc.previewSite(id, body.query, tree);
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, message, error: message, html: "", data: null, cached: false }, 422);
  }
});

/** Mint HttpOnly auth cookie for draft iframe (assets cannot send Authorization). */
app.post("/:id/live/session", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const token = readAccessToken(c);
  if (!token) throw new UnauthorizedException("Authentication required");
  return c.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": accessTokenCookieHeader(token),
        "Cache-Control": "no-store",
      },
    },
  );
});

app.get("/:id/live", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const token = readAccessToken(c);
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (token) headers["Set-Cookie"] = accessTokenCookieHeader(token);

  // Strip legacy ?access_token= from URL so it never appears on asset requests / logs.
  if (c.req.query("access_token")) {
    headers.Location = `/api/sites/${id}/live`;
    return new Response(null, { status: 302, headers });
  }

  try {
    const html = await svc.renderDraftLiveHtml(id, c.req.raw);
    return new Response(html, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`<!DOCTYPE html><pre style="padding:16px;color:#b91c1c">${message}</pre>`, {
      status: 422,
      headers,
    });
  }
});

app.get("/:id/live/assets/:file", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const file = c.req.param("file");
  if (file !== "app.js" && file !== "styles.css") return c.json({ message: "Not found" }, 404);
  const asset = await svc.getDraftLiveAsset(id, file);
  return new Response(asset.body, {
    headers: { "Content-Type": asset.contentType, "Cache-Control": "no-store" },
  });
});

app.get("/:id/data", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const result = await svc.loadDraftSiteData(id, c.req.raw);
  return c.json(result);
});

app.post("/:id/action", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  return c.json(await svc.runDraftAction(id, c.req.raw));
});

app.get("/:id/thumbnail", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const png = await svc.getSiteThumbnailPng(id);
  if (!png) throw new NotFoundException("Thumbnail not found");
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
});

app.put("/:id/thumbnail", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const buf = Buffer.from(await c.req.arrayBuffer());
  return c.json(await svc.saveSiteThumbnailPng(id, buf));
});

app.post("/:id/resolve-selection", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = await c.req.json<{
    sourceAnchor?: string;
    tagName?: string;
    className?: string;
    text?: string;
    outerHtml?: string;
  }>();
  return c.json(await svc.resolveSelection(id, body ?? {}));
});

app.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { file?: string };
  return c.json(await svc.approveSite(id, body.file));
});

app.post("/:id/discard", async (c) => {
  const id = c.req.param("id");
  await svc.requireSiteAccess(id, authUser(c));
  const body = (await c.req.json().catch(() => ({}))) as { file?: string };
  return c.json(await svc.discardSiteDraft(id, body.file));
});

app.post("/:id/agent/stream", async (c) => {
  const siteId = c.req.param("id");
  await svc.requireSiteAccess(siteId, authUser(c));
  const body = await c.req.json<SiteAgentStreamRequest>();
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    await streamSiteAgent(siteId, body, stream, abort.signal, c.req.raw);
  });
});

export default app;
