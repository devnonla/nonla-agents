import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { BadRequestException } from "../../../../common/exceptions/http.exception.js";
import { deleteKvByKey, getKvByKey, loadKvMap, upsertKvByKey } from "../../../kvstore/kvstore.service.js";

const ALL_ACTIONS = ["get", "set", "list", "delete"] as const;
type KvAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<KvAction, string> = {
  get: "**get**: Read a value. Requires `key`.",
  set: "**set**: Create or update a value. Requires `key` and `value`.",
  list: "**list**: List all keys and values.",
  delete: "**delete**: Remove a key. Requires `key`.",
};

export function makeKvStoreTool(actions: readonly KvAction[] = ALL_ACTIONS): StructuredToolInterface {
  const allowed = actions.length > 0 ? actions : ALL_ACTIONS;
  const description = `Read and write the shared workspace key-value store. Keys must match [A-Z][A-Z0-9_]* (e.g. BASE_URL). Prefer the secrets tool for credentials.

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}`;

  return tool(
    async ({ action, key, value }: { action: string; key?: string; value?: string }) => {
      try {
        if (!(allowed as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${allowed.join(", ")}.` });
        }

        if (action === "list") {
          const map = loadKvMap();
          const entries = Object.entries(map).map(([k, v]) => ({ key: k, value: v }));
          return JSON.stringify({ ok: true, count: entries.length, entries });
        }

        if (!key?.trim()) {
          return JSON.stringify({ ok: false, error: "'key' is required for get/set/delete." });
        }
        const normalized = key.trim().toUpperCase();

        if (action === "get") {
          const entry = getKvByKey(normalized);
          if (!entry) return JSON.stringify({ ok: false, error: `Key "${normalized}" not found.` });
          return JSON.stringify({ ok: true, key: entry.key, value: entry.value });
        }

        if (action === "set") {
          if (typeof value !== "string") {
            return JSON.stringify({ ok: false, error: "'value' is required for set." });
          }
          const entry = upsertKvByKey({ key: normalized, value });
          return JSON.stringify({ ok: true, key: entry?.key ?? normalized, value: entry?.value ?? value });
        }

        if (action === "delete") {
          deleteKvByKey(normalized);
          return JSON.stringify({ ok: true, deleted: normalized });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        const message = err instanceof BadRequestException ? err.message : err instanceof Error ? err.message : String(err);
        return JSON.stringify({ ok: false, error: message });
      }
    },
    {
      name: "kv_store",
      description,
      schema: z.object({
        action: z.enum(allowed as unknown as [string, ...string[]]).describe("Operation to perform"),
        key: z.string().optional().describe("KV key (required for get/set/delete)"),
        value: z.string().optional().describe("Value to store (required for set)"),
      }),
    },
  );
}

export const kvStoreTool = makeKvStoreTool();

export const TOOL_DEF = {
  toolName: "kv_store",
  toolLabel: "KV Store",
  description: "Read and write the shared workspace key-value store (get/set/list/delete). Keys: [A-Z][A-Z0-9_]*. Prefer Secrets for credentials.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...ALL_ACTIONS] },
      key: { type: "string", description: "KV key (required for get/set/delete)" },
      value: { type: "string", description: "Value to store (required for set)" },
    },
    required: ["action"],
  },
};
