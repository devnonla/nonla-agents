import { Hono } from "hono";
import { renderChatOgPng, renderSiteOgPng } from "./og.service.js";

const app = new Hono();

const PNG_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=300",
};

function stripPngSuffix(value: string): string {
  return value.toLowerCase().endsWith(".png") ? value.slice(0, -4) : value;
}

app.get("/chat/:agentId", async (c) => {
  const agentId = decodeURIComponent(stripPngSuffix(c.req.param("agentId")));
  return new Response(new Uint8Array(await renderChatOgPng(agentId)), { headers: PNG_HEADERS });
});

app.get("/sites/:slug", async (c) => {
  const slug = decodeURIComponent(stripPngSuffix(c.req.param("slug")));
  return new Response(new Uint8Array(await renderSiteOgPng(slug)), { headers: PNG_HEADERS });
});

export default app;
