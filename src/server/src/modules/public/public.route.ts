import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { clearSiteAccessTokenCookieHeader, parseCookieValue, siteAccessTokenCookieHeader, siteTokenCookieName } from "../../common/middleware/auth.middleware.js";
import { streamChatSSE } from "../agents/runtime/runtime.service.js";
import { relayRunToSSE, runRegistry } from "../agents/runtime/utils/run-registry.js";
import { loadPublicSiteData, renderPublicSite, runPublicAction, verifySitePublicAccessToken, verifySitePublicPassword } from "../sites/sites.service.js";
import { createPublicConversation, deletePublicConversation, getPublicAgent, getPublicConversation, listPublicConversations, requirePublicConversation, verifyPublicPassword, verifyPublicToken } from "./public.service.js";

function siteAccessFromRequest(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined; param: (name: string) => string } }, body?: { password?: string; token?: string }) {
  const slug = c.req.param("slug");
  const auth = c.req.header("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const headerToken = c.req.header("x-site-access-token")?.trim();
  const queryToken = c.req.query("token")?.trim() || c.req.query("site_token")?.trim();
  const cookieToken = slug ? (parseCookieValue(c.req.header("Cookie"), siteTokenCookieName(slug)) ?? undefined) : undefined;
  return {
    password: body?.password,
    token: body?.token || bearer || headerToken || queryToken || cookieToken || undefined,
  };
}

const app = new Hono();

// GET /api/public/agents/:id
app.get("/agents/:id", async (c) => {
  const result = await getPublicAgent(c.req.param("id"));
  return c.json(result.data);
});

// POST /api/public/agents/:id/verify
app.post("/agents/:id/verify", async (c) => {
  const { password } = await c.req.json<{ password?: string }>();
  const result = await verifyPublicPassword(c.req.param("id"), password);
  return c.json({ valid: result.valid, token: result.token });
});

// POST /api/public/agents/:id/verify-token
app.post("/agents/:id/verify-token", async (c) => {
  const { token } = await c.req.json<{ token?: string }>();
  if (!token) return c.json({ valid: false });
  const valid = await verifyPublicToken(c.req.param("id"), token);
  return c.json({ valid });
});

// GET /api/public/agents/:id/conversations?fp=<fingerprint>
// List all conversations for this fingerprint
app.get("/agents/:id/conversations", async (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = await listPublicConversations(c.req.param("id"), fp);
  return c.json(result.data);
});

// POST /api/public/agents/:id/conversations?fp=<fingerprint>
// Create a new conversation
app.post("/agents/:id/conversations", async (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = await createPublicConversation(c.req.param("id"), fp);
  return c.json(result.data);
});

// GET /api/public/agents/:id/conversations/:convId?fp=<fingerprint>
// Load a specific conversation + messages
app.get("/agents/:id/conversations/:convId", async (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  const result = await getPublicConversation(c.req.param("id"), c.req.param("convId"), fp);
  return c.json(result.data);
});

// DELETE /api/public/agents/:id/conversations/:convId?fp=<fingerprint>
app.delete("/agents/:id/conversations/:convId", async (c) => {
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "Fingerprint required" }, 400);
  await deletePublicConversation(c.req.param("id"), c.req.param("convId"), fp);
  return c.json({ ok: true });
});

// ─── Chat send (SSE response) ────────────────────────────────────────────────
// POST /api/public/agents/:id/conversations/:convId/chat?fp=<fingerprint>
app.post("/agents/:id/conversations/:convId/chat", async (c) => {
  const agentId = c.req.param("id");
  const convId = c.req.param("convId");
  const fp = c.req.query("fp");
  if (!fp) throw new BadRequestException("Fingerprint required");

  await requirePublicConversation(agentId, convId, fp);

  const body = await c.req.json<{ message: string; password?: string; token?: string }>();

  return streamSSE(c, async (stream) => {
    await streamChatSSE({ agentId, conversationId: convId, message: body.message, password: body.password, token: body.token }, stream);
  });
});

// ─── SSE Stream ──────────────────────────────────────────────────────────────
// GET /api/public/agents/:id/conversations/:convId/stream?fp=<fingerprint>
// Subscribe to live stream events. Validates ownership via fingerprint.
app.get("/agents/:id/conversations/:convId/stream", async (c) => {
  const agentId = c.req.param("id");
  const convId = c.req.param("convId");
  const fp = c.req.query("fp");
  if (!fp) throw new BadRequestException("Fingerprint required");

  await requirePublicConversation(agentId, convId, fp);

  // Wait briefly — client may open stream right as POST registers the run
  const maxWait = 5000;
  const pollInterval = 50;
  let waited = 0;
  while (!runRegistry.has(convId) && waited < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));
    waited += pollInterval;
  }

  if (!runRegistry.has(convId)) {
    return c.json({ error: "No active stream for this conversation" }, 404);
  }

  return streamSSE(c, async (stream) => {
    await relayRunToSSE(convId, stream);
  });
});

// ─── Public Sites ────────────────────────────────────────────────────────────

app.get("/sites/:slug", async (c) => {
  const access = siteAccessFromRequest(c);
  const result = await renderPublicSite(c.req.param("slug"), c.req.raw, access);
  return c.json(result);
});

app.get("/sites/:slug/data", async (c) => {
  const access = siteAccessFromRequest(c);
  const result = await loadPublicSiteData(c.req.param("slug"), c.req.raw, access);
  return c.json(result);
});

app.post("/sites/:slug/verify", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  const result = await verifySitePublicPassword(slug, body.password);
  const headers: Record<string, string> = {};
  if (result.token) {
    headers["Set-Cookie"] = siteAccessTokenCookieHeader(slug, result.token);
  } else {
    headers["Set-Cookie"] = clearSiteAccessTokenCookieHeader(slug);
  }
  return c.json(result, { headers });
});

app.post("/sites/:slug/verify-token", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  const result = await verifySitePublicAccessToken(slug, body.token);
  const headers: Record<string, string> = {};
  if (result.valid && body.token) {
    headers["Set-Cookie"] = siteAccessTokenCookieHeader(slug, body.token);
  } else {
    headers["Set-Cookie"] = clearSiteAccessTokenCookieHeader(slug);
  }
  return c.json(result, { headers });
});

app.post("/sites/:slug/action", async (c) => {
  const access = siteAccessFromRequest(c);
  const result = await runPublicAction(c.req.param("slug"), c.req.raw, access);
  return c.json(result);
});

export default app;
