import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { BadRequestException } from "../../../../common/exceptions/http.exception.js";
import { deleteSecretByKey, getSecretMetaByKey, getSecretValueByKey, listSecrets, upsertSecretByKey } from "../../../secrets/secrets.service.js";

const ALL_ACTIONS = ["get", "set", "list", "delete"] as const;
type SecretAction = (typeof ALL_ACTIONS)[number];

const DESCRIPTIONS: Record<SecretAction, string> = {
  get: "**get**: Read a decrypted value. Requires `key`.",
  set: "**set**: Create or rotate a secret. Requires `key` and `value`.",
  list: "**list**: List secret key names only (values never returned).",
  delete: "**delete**: Remove a secret. Requires `key`.",
};

export function makeSecretsTool(actions: readonly SecretAction[] = ALL_ACTIONS): StructuredToolInterface {
  const allowed = actions.length > 0 ? actions : ALL_ACTIONS;
  const description = `Access encrypted workspace secrets. Keys must match [A-Z][A-Z0-9_]* (e.g. API_TOKEN). Prefer this over kv_store for credentials.

Available actions:
${allowed.map((a) => `- ${DESCRIPTIONS[a]}`).join("\n")}`;

  return tool(
    async ({ action, key, value }: { action: string; key?: string; value?: string }) => {
      try {
        if (!(allowed as readonly string[]).includes(action)) {
          return JSON.stringify({ ok: false, error: `Action "${action}" is not allowed. Use: ${allowed.join(", ")}.` });
        }

        if (action === "list") {
          const result = listSecrets({ limit: "1000", sorts: "key" });
          const keys = (result.items as { key: string }[]).map((item) => item.key);
          return JSON.stringify({ ok: true, count: keys.length, keys });
        }

        if (!key?.trim()) {
          return JSON.stringify({ ok: false, error: "'key' is required for get/set/delete." });
        }
        const normalized = key.trim().toUpperCase();

        if (action === "get") {
          const secretValue = getSecretValueByKey(normalized);
          if (secretValue === null) return JSON.stringify({ ok: false, error: `Key "${normalized}" not found.` });
          return JSON.stringify({ ok: true, key: normalized, value: secretValue });
        }

        if (action === "set") {
          if (typeof value !== "string" || value.length === 0) {
            return JSON.stringify({ ok: false, error: "'value' is required for set." });
          }
          const meta = upsertSecretByKey({ key: normalized, value });
          return JSON.stringify({ ok: true, key: meta?.key ?? normalized, message: "Secret saved (encrypted at rest)." });
        }

        if (action === "delete") {
          const existing = getSecretMetaByKey(normalized);
          if (!existing) return JSON.stringify({ ok: false, error: `Key "${normalized}" not found.` });
          deleteSecretByKey(normalized);
          return JSON.stringify({ ok: true, deleted: normalized });
        }

        return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        const message = err instanceof BadRequestException ? err.message : err instanceof Error ? err.message : String(err);
        return JSON.stringify({ ok: false, error: message });
      }
    },
    {
      name: "secrets",
      description,
      schema: z.object({
        action: z.enum(allowed as unknown as [string, ...string[]]).describe("Operation to perform"),
        key: z.string().optional().describe("Secret key (required for get/set/delete)"),
        value: z.string().optional().describe("Secret value (required for set)"),
      }),
    },
  );
}

export const secretsTool = makeSecretsTool();

export const TOOL_DEF = {
  toolName: "secrets",
  toolLabel: "Secrets",
  description: "Access encrypted workspace secrets (get/set/list/delete). list returns keys only. Keys: [A-Z][A-Z0-9_]*. Prefer over KV Store for credentials.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...ALL_ACTIONS] },
      key: { type: "string", description: "Secret key (required for get/set/delete)" },
      value: { type: "string", description: "Secret value (required for set)" },
    },
    required: ["action"],
  },
};
