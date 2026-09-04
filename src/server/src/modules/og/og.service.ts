import { eq } from "drizzle-orm";
import { agents, getDb, sites } from "../../common/db/client.js";
import { qone } from "../../common/db/query.js";
import { DEFAULT_OG_CARD, type OgCard, renderOgPng } from "../../common/og-image.js";

export async function loadChatOgCard(agentId: string): Promise<OgCard | null> {
  try {
    const agent = await qone(getDb().select().from(agents).where(eq(agents.id, agentId)));
    if (!agent?.isPublic) return null;
    const name = agent.name?.trim() || "AI Agent";
    const description = (agent.description?.trim() || `Chat with ${name} on Nonla Agents.`).slice(0, 300);
    return { kind: "agent", title: name, description };
  } catch {
    return null;
  }
}

export async function loadSiteOgCard(slug: string): Promise<OgCard | null> {
  try {
    const site = await qone(getDb().select().from(sites).where(eq(sites.slug, slug.trim().toLowerCase())));
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

export async function renderChatOgPng(agentId: string): Promise<Buffer> {
  return renderOgPng((await loadChatOgCard(agentId)) ?? DEFAULT_OG_CARD);
}

export async function renderSiteOgPng(slug: string): Promise<Buffer> {
  return renderOgPng((await loadSiteOgCard(slug)) ?? DEFAULT_OG_CARD);
}
