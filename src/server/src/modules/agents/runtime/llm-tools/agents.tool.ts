import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { getAgent, listAgents } from "../../agents.service.js";

const ALL_ACTIONS = ["list", "get"] as const;
type AgentsAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<AgentsAction, string> = {
  list: "**list**: List workspace agents (`id`, `name`, `description`, `isActive`). Use returned `id` with `nonlaagents.agents(id).run(message)`.",
  get: "**get**: Fetch one agent by `id`. Requires `id`.",
};

function summarizeAgent(a: { id: string; name: string; description: string | null; isActive: boolean }) {
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? "",
    isActive: a.isActive,
  };
}

export function makeAgentsTool(actions: readonly AgentsAction[] = ALL_ACTIONS): StructuredToolInterface {
  const allowed = actions.length > 0 ? actions : ALL_ACTIONS;
  const description = `Discover workspace agents you can call from job scripts via nonlaagents.agents(agentId).run(message).

Discovery flow:
1. list — pick an agent id
2. get(id) — optional detail before coding

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}`;

  return tool(
    async ({ action, id }: { action: string; id?: string }) => {
      try {
        if (!(allowed as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${allowed.join(", ")}.` });
        }

        if (action === "list") {
          const items = listAgents().map(summarizeAgent);
          return JSON.stringify({ ok: true, count: items.length, items });
        }

        if (action === "get") {
          const agentId = id?.trim() ?? "";
          if (!agentId) return JSON.stringify({ ok: false, error: "'id' is required for get." });
          const agent = getAgent(agentId);
          if (!agent) return JSON.stringify({ ok: false, error: `Agent not found: ${agentId}` });
          return JSON.stringify({ ok: true, agent: summarizeAgent(agent) });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ ok: false, error: message });
      }
    },
    {
      name: "agents",
      description,
      schema: z.object({
        action: z.enum(allowed as unknown as [string, ...string[]]).describe("Operation to perform"),
        id: z.string().optional().describe("Agent id (required for get)"),
      }),
    },
  );
}

export const agentsTool = makeAgentsTool();
