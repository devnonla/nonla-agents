/**
 * memory — per-user knowledge graph for an agent.
 *
 * Nodes: short durable facts (one `content` string each, untyped).
 * Edges: free-form short relation labels between nodes.
 * Nothing is auto-injected into the system prompt — call search/neighbors/list to recall.
 */

import { type StructuredToolInterface, tool } from "@langchain/core/tools";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { MEMORY_RELATION_MAX, getDb, memoryEdges, memoryNodes } from "../../../../common/db/client.js";
import { normalizeRelation } from "../../memory.service.js";
import { MEMORY_CONTENT_MAX } from "../utils/factBudget.js";

export type MakeMemoryToolOptions = {
  conversationId?: string | null;
};

const ACTIONS = ["upsert_node", "update_node", "forget_node", "link", "unlink", "search", "neighbors", "list"] as const;

function resolveContent(content?: string, label?: string): string {
  return (content ?? label ?? "").trim();
}

export function makeMemoryTool(agentId: string, ownerId: string, _isGuest = false, options: MakeMemoryToolOptions = {}): StructuredToolInterface {
  const conversationId = options.conversationId ?? null;

  const description = `Manage this user's long-term memory as a small knowledge graph.
Memory is NOT injected into the prompt — use search / neighbors / list when you need to recall.

Save ONLY durable identity: preferences, people, projects, standing constraints, explicit "remember this".
Do NOT save task progress, research dumps, tool output, or one-off details. Prefer 0–2 nodes per turn.
Prefer linking existing nodes over creating near-duplicates. Long playbooks belong in Skills, not memory.

Each node is a single short \`content\` string (≤${MEMORY_CONTENT_MAX} chars). No type field.
Edges use a short free-form \`relation\` (snake_case, ≤${MEMORY_RELATION_MAX} chars), e.g. owns, prefers, works_on, competes_with, uses, related_to.

Actions:
- **upsert_node**: Create a node (\`content\`). Pass \`id\` to update.
- **update_node**: Update by \`id\` (content).
- **forget_node**: Delete node + its edges by \`id\`.
- **link**: Connect \`from_id\` → \`to_id\` with \`relation\`.
- **unlink**: Remove link (\`from_id\`, \`to_id\`, optional \`relation\`).
- **search**: Find nodes by \`query\` (content).
- **neighbors**: 1-hop links for \`id\`.
- **list**: List this user's nodes and edges.

Core nodes appear in <memory> (budgeted). Use search/neighbors for the rest.`;

  return tool(
    async ({
      action,
      id,
      label,
      content,
      from_id,
      to_id,
      relation,
      query,
    }: {
      action: string;
      id?: string;
      /** @deprecated use content */
      label?: string;
      content?: string;
      from_id?: string;
      to_id?: string;
      relation?: string;
      query?: string;
    }) => {
      const db = getDb();
      const now = new Date();

      const scopeNode = (nodeId: string) =>
        db
          .select()
          .from(memoryNodes)
          .where(and(eq(memoryNodes.id, nodeId), eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
          .get();

      if (action === "upsert_node") {
        if (id) {
          const existing = scopeNode(id);
          if (!existing) return JSON.stringify({ ok: false, error: "Node not found." });
          const nextContent = content !== undefined || label !== undefined ? resolveContent(content, label) : existing.content;
          if (!nextContent) return JSON.stringify({ ok: false, error: "content cannot be empty." });
          if (nextContent.length > MEMORY_CONTENT_MAX) {
            return JSON.stringify({ ok: false, error: `content must be ≤${MEMORY_CONTENT_MAX} characters.` });
          }
          db.update(memoryNodes).set({ content: nextContent, updatedAt: now }).where(eq(memoryNodes.id, id)).run();
          return JSON.stringify({
            ok: true,
            id,
            node: { id, content: nextContent },
            message: "Node updated.",
          });
        }

        const trimmedContent = resolveContent(content, label);
        if (!trimmedContent) return JSON.stringify({ ok: false, error: "Provide 'content' for a new node." });
        if (trimmedContent.length > MEMORY_CONTENT_MAX) {
          return JSON.stringify({ ok: false, error: `content must be ≤${MEMORY_CONTENT_MAX} characters.` });
        }

        const nodeId = crypto.randomUUID();
        db.insert(memoryNodes)
          .values({
            id: nodeId,
            agentId,
            ownerId,
            content: trimmedContent,
            sourceConversationId: conversationId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return JSON.stringify({
          ok: true,
          id: nodeId,
          node: { id: nodeId, content: trimmedContent },
          message: "Node created.",
        });
      }

      if (action === "update_node") {
        if (!id) return JSON.stringify({ ok: false, error: "'id' is required for update_node." });
        const existing = scopeNode(id);
        if (!existing) return JSON.stringify({ ok: false, error: "Node not found." });
        const patch: Record<string, unknown> = { updatedAt: now };
        if (content !== undefined || label !== undefined) {
          const next = resolveContent(content, label);
          if (!next) return JSON.stringify({ ok: false, error: "content cannot be empty." });
          if (next.length > MEMORY_CONTENT_MAX) {
            return JSON.stringify({ ok: false, error: `content must be ≤${MEMORY_CONTENT_MAX} characters.` });
          }
          patch.content = next;
        }
        db.update(memoryNodes).set(patch).where(eq(memoryNodes.id, id)).run();
        return JSON.stringify({ ok: true, id, message: "Node updated." });
      }

      if (action === "forget_node") {
        if (!id) return JSON.stringify({ ok: false, error: "'id' is required for forget_node." });
        const existing = scopeNode(id);
        if (!existing) return JSON.stringify({ ok: false, error: "Node not found." });
        db.delete(memoryEdges)
          .where(and(eq(memoryEdges.agentId, agentId), or(eq(memoryEdges.fromId, id), eq(memoryEdges.toId, id))))
          .run();
        db.delete(memoryNodes).where(eq(memoryNodes.id, id)).run();
        return JSON.stringify({ ok: true, id, message: "Node forgotten." });
      }

      if (action === "link") {
        if (!from_id || !to_id) return JSON.stringify({ ok: false, error: "Provide from_id and to_id." });
        if (from_id === to_id) return JSON.stringify({ ok: false, error: "Cannot link a node to itself." });
        let rel: string;
        try {
          rel = normalizeRelation(relation);
        } catch (err) {
          return JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : "Invalid relation.",
          });
        }
        const from = scopeNode(from_id);
        const to = scopeNode(to_id);
        if (!from || !to) return JSON.stringify({ ok: false, error: "Both nodes must exist for this user." });
        const dup = db
          .select()
          .from(memoryEdges)
          .where(and(eq(memoryEdges.agentId, agentId), eq(memoryEdges.fromId, from_id), eq(memoryEdges.toId, to_id), eq(memoryEdges.relation, rel)))
          .get();
        if (dup) return JSON.stringify({ ok: true, id: dup.id, message: "Link already exists." });
        const edgeId = crypto.randomUUID();
        db.insert(memoryEdges)
          .values({
            id: edgeId,
            agentId,
            ownerId,
            fromId: from_id,
            toId: to_id,
            relation: rel,
            createdAt: now,
          })
          .run();
        return JSON.stringify({
          ok: true,
          id: edgeId,
          edge: { id: edgeId, from_id, to_id, relation: rel },
          message: "Linked.",
        });
      }

      if (action === "unlink") {
        if (!from_id || !to_id) return JSON.stringify({ ok: false, error: "Provide from_id and to_id." });
        const rows = db
          .select()
          .from(memoryEdges)
          .where(and(eq(memoryEdges.agentId, agentId), eq(memoryEdges.ownerId, ownerId), eq(memoryEdges.fromId, from_id), eq(memoryEdges.toId, to_id)))
          .all();
        let filtered = rows;
        if (relation) {
          try {
            const rel = normalizeRelation(relation);
            filtered = rows.filter((r) => r.relation === rel);
          } catch (err) {
            return JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : "Invalid relation.",
            });
          }
        }
        for (const row of filtered) {
          db.delete(memoryEdges).where(eq(memoryEdges.id, row.id)).run();
        }
        return JSON.stringify({ ok: true, removed: filtered.length });
      }

      if (action === "search") {
        const q = (query ?? "").trim().toLowerCase();
        if (!q) return JSON.stringify({ ok: false, error: "Provide 'query' for search." });
        const rows = db
          .select({
            id: memoryNodes.id,
            content: memoryNodes.content,
          })
          .from(memoryNodes)
          .where(and(eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
          .all();
        const matched = rows.filter((r) => r.content.toLowerCase().includes(q));
        return JSON.stringify({ ok: true, count: matched.length, nodes: matched.slice(0, 40) });
      }

      if (action === "neighbors") {
        if (!id) return JSON.stringify({ ok: false, error: "'id' is required for neighbors." });
        const node = scopeNode(id);
        if (!node) return JSON.stringify({ ok: false, error: "Node not found." });
        const edges = db
          .select()
          .from(memoryEdges)
          .where(and(eq(memoryEdges.agentId, agentId), eq(memoryEdges.ownerId, ownerId), or(eq(memoryEdges.fromId, id), eq(memoryEdges.toId, id))))
          .all();
        const otherIds = [...new Set(edges.map((e) => (e.fromId === id ? e.toId : e.fromId)))];
        const others =
          otherIds.length === 0
            ? []
            : db
                .select({
                  id: memoryNodes.id,
                  content: memoryNodes.content,
                })
                .from(memoryNodes)
                .where(and(eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
                .all()
                .filter((n) => otherIds.includes(n.id));
        const byId = new Map(others.map((n) => [n.id, n]));
        const links = edges.map((e) => {
          const otherId = e.fromId === id ? e.toId : e.fromId;
          const other = byId.get(otherId);
          return {
            edge_id: e.id,
            relation: e.relation,
            direction: e.fromId === id ? "out" : "in",
            node: other ?? { id: otherId },
          };
        });
        return JSON.stringify({
          ok: true,
          node: { id: node.id, content: node.content },
          links,
        });
      }

      if (action === "list") {
        const nodes = db
          .select({
            id: memoryNodes.id,
            content: memoryNodes.content,
          })
          .from(memoryNodes)
          .where(and(eq(memoryNodes.agentId, agentId), eq(memoryNodes.ownerId, ownerId)))
          .all();
        const edges = db
          .select({
            id: memoryEdges.id,
            from_id: memoryEdges.fromId,
            to_id: memoryEdges.toId,
            relation: memoryEdges.relation,
          })
          .from(memoryEdges)
          .where(and(eq(memoryEdges.agentId, agentId), eq(memoryEdges.ownerId, ownerId)))
          .all();
        return JSON.stringify({ ok: true, nodes, edges });
      }

      return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
    },
    {
      name: "memory",
      description,
      schema: z.object({
        action: z.enum(ACTIONS),
        id: z.string().optional().describe("Node id"),
        content: z.string().optional().describe(`Node text (≤${MEMORY_CONTENT_MAX} chars)`),
        label: z.string().optional().describe("Deprecated alias for content"),
        from_id: z.string().optional().describe("Edge source node id"),
        to_id: z.string().optional().describe("Edge target node id"),
        relation: z.string().optional().describe(`Short free-form relation snake_case (≤${MEMORY_RELATION_MAX} chars)`),
        query: z.string().optional().describe("Search query"),
      }),
    },
  );
}

export const TOOL_DEF = {
  toolName: "memory",
  toolLabel: "Memory",
  description: "Manage this user's knowledge graph (nodes + relations).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["upsert_node", "update_node", "forget_node", "link", "unlink", "search", "neighbors", "list"],
      },
      id: { type: "string", description: "Node id" },
      content: { type: "string", description: `Node text (≤${MEMORY_CONTENT_MAX} chars)` },
      from_id: { type: "string", description: "Edge source node id" },
      to_id: { type: "string", description: "Edge target node id" },
      relation: {
        type: "string",
        description: `Short free-form relation snake_case (≤${MEMORY_RELATION_MAX} chars)`,
      },
      query: { type: "string", description: "Search query" },
    },
    required: ["action"],
  },
};

/** @deprecated */
export const makeUserMemoryTool = makeMemoryTool;
/** @deprecated */
export const makeManageMemoryTool = makeMemoryTool;
