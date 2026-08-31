import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { sites } from "../common/db/schema.js";
import { DEFAULT_OG_CARD, buildOgSvg } from "../common/og-image.js";
import { loadChatOgCard, loadSiteOgCard } from "../modules/og/og.service.js";
import { buildSiteShellHtml, buildSiteUnlockHtml } from "../modules/sites/sites-bundle.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectPng(buf: Uint8Array) {
  expect([...buf.subarray(0, 8)]).toEqual(PNG_MAGIC);
}

describe("OG image API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let publicAgentId = "";
  let privateAgentId = "";

  beforeAll(async () => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;

    const pub = await authRequest(app, token, "POST", "/api/agents", {
      name: "Public Helper",
      description: "Helps with research",
    });
    publicAgentId = ((await pub.json()) as { id: string }).id;
    await authRequest(app, token, "PUT", `/api/agents/${publicAgentId}`, { isPublic: true });

    const priv = await authRequest(app, token, "POST", "/api/agents", {
      name: "Secret Agent",
      description: "Internal only",
    });
    privateAgentId = ((await priv.json()) as { id: string }).id;

    t.db.insert(sites).values({ id: crypto.randomUUID(), name: "Public Catalog", slug: "public-catalog", isPublished: true }).run();
    t.db.insert(sites).values({ id: crypto.randomUUID(), name: "Secret Site", slug: "secret-site", isPublished: false }).run();
  });

  afterAll(() => cleanup());

  test("buildOgSvg includes name and description", () => {
    const card = loadChatOgCard(publicAgentId);
    expect(card).not.toBeNull();
    expect(card?.title).toBe("Public Helper");
    expect(card?.description).toContain("Helps with research");

    const svg = buildOgSvg(card!);
    expect(svg).toContain("Public Helper");
    expect(svg).toContain("Helps with research");
    expect(svg).toContain("AGENT");
    expect(svg).not.toContain("Browser");
    expect(svg).not.toContain('height="630" fill="#dd7627"');
    expect(svg).toContain("PUBLIC CHAT");
  });

  test("buildOgSvg wraps and ellipsizes long titles", () => {
    const svg = buildOgSvg({
      kind: "agent",
      title: "CheckDomainAvailabilityAndPricing Cho Toàn Bộ Portfolio Thương Mại Điện Tử",
      description: "Chat with this agent on Nonla Agents.",
    });
    const titles = [...svg.matchAll(/font-weight="900">([^<]+)</g)].map((m) => m[1]);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.length).toBeLessThanOrEqual(2);
    for (const line of titles) {
      expect(line.length * 64 * 0.54).toBeLessThanOrEqual(820);
    }
    expect(titles.join("")).toContain("…");
    expect(titles[0]).not.toBe("CheckDomainAvailabilityAndPricing");
  });

  test("GET /api/og/chat/:id.png — public agent PNG", async () => {
    const res = await app.request(`/api/og/chat/${publicAgentId}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expectPng(new Uint8Array(await res.arrayBuffer()));
  });

  test("GET /api/og/sites/:slug.png — published site PNG", async () => {
    const card = loadSiteOgCard("public-catalog");
    expect(card?.title).toBe("Public Catalog");
    expect(card?.kind).toBe("site");
    expect(buildOgSvg(card!)).toContain("Public Catalog");
    expect(buildOgSvg(card!)).toContain("SITE");

    const res = await app.request("/api/og/sites/public-catalog.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expectPng(new Uint8Array(await res.arrayBuffer()));
  });

  test("private agent and unpublished site use generic card", async () => {
    expect(loadChatOgCard(privateAgentId)).toBeNull();
    expect(loadSiteOgCard("secret-site")).toBeNull();
    expect(buildOgSvg(DEFAULT_OG_CARD)).not.toContain("Secret Agent");
    expect(buildOgSvg(DEFAULT_OG_CARD)).not.toContain("Secret Site");
    expect(buildOgSvg(DEFAULT_OG_CARD)).toContain("NONLA AGENTS");
    expect(buildOgSvg(DEFAULT_OG_CARD)).toContain("NONLA");
    expect(buildOgSvg(DEFAULT_OG_CARD)).not.toContain("RAW AGENTS");

    const chatRes = await app.request(`/api/og/chat/${privateAgentId}.png`);
    expect(chatRes.status).toBe(200);
    expectPng(new Uint8Array(await chatRes.arrayBuffer()));

    const siteRes = await app.request("/api/og/sites/secret-site.png");
    expect(siteRes.status).toBe(200);
    expectPng(new Uint8Array(await siteRes.arrayBuffer()));
  });

  test("buildSiteShellHtml and unlock HTML inject og:image", () => {
    const shell = buildSiteShellHtml({
      title: "Docs",
      apiBase: "/api/public/sites/docs",
      slug: "docs",
      assetBase: "/public/sites/docs/assets",
      origin: "https://agents.example.com",
    });
    expect(shell).toContain('property="og:image" content="https://agents.example.com/api/og/sites/docs.png"');
    expect(shell).toContain("Docs · Nonla Agents");

    const unlock = buildSiteUnlockHtml({
      title: "Docs",
      slug: "docs",
      origin: "https://agents.example.com",
    });
    expect(unlock).toContain('property="og:image" content="https://agents.example.com/api/og/sites/docs.png"');
  });
});
