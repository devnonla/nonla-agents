import type { StructuredToolInterface } from "@langchain/core/tools";
import { createMiddleware } from "langchain";
import { makeGetToolSchemaTool } from "../llm-tools/get-tool-schema.tool.js";

const GET_TOOL_SCHEMA_NAME = "get_tool_schema";

function shortToolDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/[.\n]/)[0]?.trim() || trimmed;
  if (first.length <= 100) return first;
  return `${first.slice(0, 97)}...`;
}

function collectNamesFromToolCall(out: Set<string>, name: string, args: unknown): void {
  if (!name) return;
  if (name === GET_TOOL_SCHEMA_NAME) {
    const names = (args as { names?: unknown } | null)?.names;
    if (!Array.isArray(names)) return;
    for (const n of names) {
      if (typeof n === "string" && n.trim()) out.add(n.trim());
    }
    return;
  }
  out.add(name);
}

/**
 * Recover previously disclosed tool names from conversation history.
 * Accepts MessageParam / MessageLike and LangChain BaseMessage shapes.
 */
export function collectLoadedToolNamesFromMessages(messages: unknown[]): string[] {
  const out = new Set<string>();

  for (const raw of messages ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;

    const toolCalls = m.toolCalls ?? m.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc || typeof tc !== "object") continue;
        const call = tc as { name?: unknown; args?: unknown; arguments?: unknown };
        const name = typeof call.name === "string" ? call.name : "";
        collectNamesFromToolCall(out, name, call.args ?? call.arguments);
      }
    }

    const role = typeof m.role === "string" ? m.role : undefined;
    const msgType = typeof (m as { getType?: () => string }).getType === "function" ? (m as { getType: () => string }).getType() : undefined;

    if (role === "tool-result" || role === "tool" || msgType === "tool") {
      const toolName = m.toolName ?? m.name;
      if (typeof toolName === "string" && toolName && toolName !== GET_TOOL_SCHEMA_NAME) {
        out.add(toolName);
      }
    }
  }

  return [...out];
}

function seedLoaded(loaded: Set<string>, names: Iterable<string>, registry: Map<string, StructuredToolInterface>): void {
  for (const name of names) {
    if (registry.has(name)) loaded.add(name);
  }
}

export type LazyToolsBundle = {
  getToolSchema: StructuredToolInterface;
  middleware: ReturnType<typeof createMiddleware>;
  catalogPromptSection: string;
  allToolsForAgent: StructuredToolInterface[];
  loadedToolNames: () => string[];
};

export type BuildLazyToolsBundleOptions = {
  /** Prior conversation messages — hydrate previously loaded tool schemas. */
  messages?: unknown[];
};

/**
 * Defer full tool schemas until the model calls get_tool_schema({ names }).
 * All resolved tools stay registered for execution; wrapModelCall only exposes
 * get_tool_schema + tools whose schemas have been loaded (this run or prior turns).
 */
export function buildLazyToolsBundle(resolvedTools: StructuredToolInterface[], options: BuildLazyToolsBundleOptions = {}): LazyToolsBundle {
  const registry = new Map<string, StructuredToolInterface>();
  for (const t of resolvedTools) {
    if (t.name && t.name !== GET_TOOL_SCHEMA_NAME) registry.set(t.name, t);
  }

  const loaded = new Set<string>();
  if (options.messages?.length) {
    seedLoaded(loaded, collectLoadedToolNamesFromMessages(options.messages), registry);
  }

  const getToolSchema = makeGetToolSchemaTool(registry, (names) => {
    seedLoaded(loaded, names, registry);
  });

  const middleware = createMiddleware({
    name: "LazyToolSchemas",
    wrapModelCall: (request, handler) => {
      const stateMessages = (request as { state?: { messages?: unknown[] } }).state?.messages;
      if (Array.isArray(stateMessages) && stateMessages.length > 0) {
        seedLoaded(loaded, collectLoadedToolNamesFromMessages(stateMessages), registry);
      }
      const visible: StructuredToolInterface[] = [getToolSchema, ...resolvedTools.filter((t) => t.name && loaded.has(t.name))];
      return handler({ ...request, tools: visible });
    },
  });

  const catalogLines = [...registry.values()].map((t) => {
    const desc = shortToolDescription(t.description ?? "");
    return desc ? `- \`${t.name}\` — ${desc}` : `- \`${t.name}\``;
  });

  const catalogPromptSection =
    catalogLines.length === 0
      ? ""
      : `<available_tools>
Tools are listed by name only. Before calling any tool, load its schema with \`get_tool_schema({ names: ["tool_a", "tool_b"] })\`. Batch every tool you need in one call. After schemas load, call those tools with their real parameters.

${catalogLines.join("\n")}
</available_tools>`;

  return {
    getToolSchema,
    middleware,
    catalogPromptSection,
    allToolsForAgent: [getToolSchema, ...resolvedTools],
    loadedToolNames: () => [...loaded],
  };
}

export function appendToolsCatalog(systemPrompt: string, catalogPromptSection: string): string {
  if (!catalogPromptSection) return systemPrompt;
  return systemPrompt ? `${systemPrompt}\n\n${catalogPromptSection}` : catalogPromptSection;
}
