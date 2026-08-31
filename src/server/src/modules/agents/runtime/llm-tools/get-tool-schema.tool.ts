import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

export function toolParametersToJsonSchema(t: StructuredToolInterface): unknown {
  const schema = (t as { schema?: unknown }).schema;
  if (!schema) return { type: "object", properties: {} };
  try {
    if (typeof (z as { toJSONSchema?: (s: unknown) => unknown }).toJSONSchema === "function") {
      return (z as { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(schema);
    }
  } catch {
    /* fall through */
  }
  try {
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    if (shape) return { type: "object", properties: Object.fromEntries(Object.keys(shape).map((k) => [k, {}])) };
  } catch {
    /* ignore */
  }
  return { type: "object", properties: {} };
}

export function makeGetToolSchemaTool(registry: Map<string, StructuredToolInterface>, onLoaded: (names: string[]) => void): StructuredToolInterface {
  return tool(
    async ({ names }) => {
      const unique = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
      const tools: Array<{ name: string; description: string; parameters: unknown }> = [];
      const missing: string[] = [];

      for (const name of unique) {
        const t = registry.get(name);
        if (!t) {
          missing.push(name);
          continue;
        }
        tools.push({
          name: t.name,
          description: t.description ?? "",
          parameters: toolParametersToJsonSchema(t),
        });
      }

      if (tools.length > 0) onLoaded(tools.map((t) => t.name));

      return JSON.stringify({
        tools,
        ...(missing.length > 0 ? { missing } : {}),
      });
    },
    {
      name: "get_tool_schema",
      description: "Load full parameter schemas for one or more tools before calling them. Pass every tool you plan to use in a single batched call via `names`. After this returns, those tools become available to invoke with their real parameters.",
      schema: z.object({
        names: z.array(z.string()).min(1).describe("Tool names to load schemas for (batch in one call)"),
      }),
    },
  );
}
