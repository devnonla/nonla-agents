import { eq } from "drizzle-orm";
import { agents, getDb, sites } from "../../common/db/client.js";
import { DEFAULT_OG_CARD, type OgCard, renderOgPng } from "../../common/og-image.js";

export function loadChatOgCard(agentId: string): OgCard | null {
  try {
    const agent = getDb().select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent?.isPublic) return null;
    const name = agent.name?.trim() || "AI Agent";
    const description = (agent.description?.trim() || `Chat with ${name} on Nonla Agents.`).slice(0, 300);
    return { kind: "agent", title: name, description };
  } catch {
    return null;
  }
}

export function loadSiteOgCard(slug: string): OgCard | null {
  try {
    const site = getDb().select().from(sites).where(eq(sites.slug, slug.trim().toLowerCase())).get();
    if (!site?.isPublished) return null;
    const name = site.name?.trim() || "Site";
    return {
      kind: "site",
      title: name,
      description: `Published site on Nonla Agents · /public/sites/${site.slug}`,
    };
  } catch {
    return null;
  }
}

export function renderChatOgPng(agentId: string): Buffer {
  return renderOgPng(loadChatOgCard(agentId) ?? DEFAULT_OG_CARD);
}

export function renderSiteOgPng(slug: string): Buffer {
  return renderOgPng(loadSiteOgCard(slug) ?? DEFAULT_OG_CARD);
}
