/**
 * prompt-agent.service.ts — Prompt Agent SSE streaming service.
 *
 * Handles the business logic for the prompt assistant:
 *   - Resolves AI model
 *   - Builds tools (generate_prompt, browser, fetch_url, datatable discovery)
 *   - Creates a ReAct agent and streams SSE events
 *   - generate_prompt writes a systemPromptDraft and emits agents:updated via WS
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SSEStreamingApi } from "hono/streaming";
import { createAgent } from "langchain";
import { browserTool } from "../../../common/ai/agent-tools/browser.tool.js";
import { fetchUrlTool } from "../../../common/ai/agent-tools/fetch-url.tool.js";
import { getChatModel } from "../../../common/ai/getChatModel.js";
import { streamAgentSSE } from "../../../common/ai/stream-agent-sse.js";
import { agents as agentsTable, getDb } from "../../../common/db/client.js";
import { qall } from "../../../common/db/query.js";
import { getAgent, listAssignments } from "../agents.service.js";
import { makeDatatableTool } from "../runtime/llm-tools/datatable.tool.js";
import { makeGeneratePromptTool } from "./llm-tools/generate-prompt.tool.js";

// ── System Prompt ─────────────────────────────────────────────────────────────

const PROMPT_AI_SYSTEM_PROMPT = `You write system prompts for other agents. Draft, improve, or rewrite this agent's prompt so it does its actual job well.

Do the work, then write. Default is to write from what you already know (user message, working prompt, name, tools, sub-agents). Only ask a question when a decision would change the prompt and you cannot reasonably infer it. Do not interview the user with a checklist (role / tone / constraints / tools / …).

When the prompt is ready, call \`generate_prompt\` with the full text. That only creates a **draft** for the user to Approve or Discard — it does not publish, and chat keeps using the live prompt until they approve. Never paste the prompt into chat. After the tool returns, confirm in one or two sentences that a draft is ready for review.

Each later turn, \`<working_prompt>\` is refreshed from that pending draft. Keep iterating on it. Do not fall back to an older live version from earlier in this chat unless the user discards or asks you to.

Shape follows the job — not a house style:
- A short paragraph is enough for a simple agent. Sections, lists, or tagged blocks are fine when the job has many tools, hard rules, or a real multi-step process.
- Do not start from a template. Do not default to Role / Workflow / Principles / Tools / Limits / Tone / Examples. Do not use emoji headings. Do not copy the layout of this message or of the context blocks below.
- If the working prompt already has a voice or structure that works, keep it and change what the user asked — don't restyle it into a framework.

What to put in the prompt:
- Who this agent is and what it is trying to get done, in language a model can follow.
- How to use the real tools and sub-agents listed below. Never invent tools, agents, or schema names.
- Only the rules, examples, and format notes that would actually change behavior. Skip generic advice ("be helpful", "be clear", "always/never" filler).
- Match the user's language unless they ask otherwise.

If the agent has \`datatable\` (or the user talks about workspace tables), discover real project/table/column names first: \`datatable\` list_projects → get_schema(project). Then write against those names.

This app renders **Mermaid 11.14**. When a diagram helps the agent, put a \`\`\`mermaid fence in the prompt. Keep it parseable for 11.14:
- Prefer flowchart or sequenceDiagram.
- Wrap any label with spaces or punctuation in one pair of double quotes: \`A["Hello world"]\`, \`F{"Need a decision?"}\`.
- Never put \`"\` inside a label — rephrase, use \`'\`, or \`#quot;\`. Nested quotes like \`F{"Dùng "Luôn luôn"?"}\` will not parse.
- No markdown (\`**bold**\`, backticks) inside mermaid. Node IDs: \`[A-Za-z_][A-Za-z0-9_]*\` — not reserved words (\`end\`, \`subgraph\`, \`graph\`).

Your tools:
- \`generate_prompt\` — write a system prompt draft (not live until the user Approves)
- \`fetch_url\` — HTTP fetch (prefer over browser). output_mode: md (main page content — default), html (main filtered HTML), raw (full HTML incl. script/style)
- \`browser\` — stealth headless Chromium. Only for SPA / JS pages that need interaction — not for simple docs reads
- \`datatable\` — read-only discovery. list_projects (\`id\` + \`name\`); get_schema with \`project\` (id preferred)`;

interface PromptAgentContext {
  agentName?: string | null;
  agentDescription?: string | null;
  currentPrompt?: string | null;
  draftPrompt?: string | null;
  tools: { name: string; label: string; description: string }[];
  callableAgents: { name: string; description: string | null }[];
}

/** Build the full system prompt for the prompt assistant, including agent context. */
function buildPromptSystemPrompt(ctx: PromptAgentContext): string {
  const parts = [PROMPT_AI_SYSTEM_PROMPT, "Context for this agent (facts to use — not a layout to copy into the draft):"];

  // ── Agent identity ──
  if (ctx.agentName) {
    const desc = ctx.agentDescription?.trim() ? `\n${ctx.agentDescription.trim()}` : "";
    parts.push(`<agent>
**Name:** ${ctx.agentName}${desc}
</agent>`);
  }

  // ── Available tools ──
  if (ctx.tools.length > 0) {
    const list = ctx.tools
      .map((t) => {
        const desc = t.description?.trim() ? ` — ${t.description.trim()}` : "";
        return `- \`${t.name}\` (**${t.label}**)${desc}`;
      })
      .join("\n");
    parts.push(`<available_tools>
Tools this agent can use at runtime:

${list}
</available_tools>`);
  } else {
    parts.push(`<available_tools>
None assigned (agent still has built-in memory management).
</available_tools>`);
  }

  // ── Sub-agents ──
  if (ctx.callableAgents.length > 0) {
    const list = ctx.callableAgents
      .map((a) => {
        const desc = a.description?.trim() ? ` — ${a.description.trim()}` : "";
        return `- **${a.name}**${desc}`;
      })
      .join("\n");
    parts.push(`<sub_agents>
Sub-agents this agent can communicate with / delegate to:

${list}
</sub_agents>`);
  } else {
    parts.push(`<sub_agents>
None.
</sub_agents>`);
  }

  // ── Working prompt (pending draft if any, else live) ──
  const live = ctx.currentPrompt?.trim() ?? "";
  const pending = ctx.draftPrompt?.trim() ?? "";
  const hasDraft = pending.length > 0 && pending !== live;
  const working = hasDraft ? pending : live;

  if (hasDraft) {
    parts.push(`<working_prompt status="draft">
This is the pending draft you are iterating on. Chat still uses a different live prompt until the user Approves — do not revert to that older text.

\`\`\`
${working}
\`\`\`
</working_prompt>`);
  } else if (working) {
    parts.push(`<working_prompt status="live">
\`\`\`
${working}
\`\`\`
</working_prompt>`);
  } else {
    parts.push(`<working_prompt>
Empty — write a new system prompt based on the user's request.
</working_prompt>`);
  }

  return parts.join("\n\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCallMessage {
  role: "tool-call";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
}

interface TextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PromptStreamRequest {
  providerId: string;
  modelId: string;
  messages: (TextMessage | ToolCallMessage)[];
}

function buildLangChainMessages(messages: PromptStreamRequest["messages"]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      result.push(new HumanMessage(msg.content));
      continue;
    }

    if (msg.role === "system") {
      result.push(new SystemMessage(msg.content));
      continue;
    }

    if (msg.role === "assistant") {
      const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === "tool-call") {
        const tc = messages[j] as ToolCallMessage;
        toolCalls.push({
          id: tc.toolCallId || `tc-${j}`,
          name: tc.toolName || "unknown",
          args: (tc.toolInput as Record<string, unknown>) ?? {},
        });
        j++;
      }

      if (toolCalls.length > 0) {
        result.push(new AIMessage({ content: msg.content, tool_calls: toolCalls }));
        for (let k = i + 1; k < j; k++) {
          const tc = messages[k] as ToolCallMessage;
          if (tc.toolOutput != null) {
            result.push(
              new ToolMessage({
                content: tc.toolOutput,
                tool_call_id: tc.toolCallId || `tc-${k}`,
              }),
            );
          }
        }
        i = j - 1;
      } else {
        result.push(new AIMessage(msg.content));
      }
      continue;
    }

    if (msg.role === "tool-call") {
      const tc = msg as ToolCallMessage;
      const toolCallId = tc.toolCallId || `tc-${i}`;
      result.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              name: tc.toolName || "unknown",
              args: (tc.toolInput as Record<string, unknown>) ?? {},
            },
          ],
        }),
      );
      if (tc.toolOutput != null) {
        result.push(new ToolMessage({ content: tc.toolOutput, tool_call_id: toolCallId }));
      }
    }
  }

  return result;
}

// ── Service ───────────────────────────────────────────────────────────────────

async function loadCallableAgents(callableAgentIds: string[]): Promise<{ name: string; description: string | null }[]> {
  if (callableAgentIds.length === 0) return [];
  const db = getDb();
  const all = await qall(db.select({ id: agentsTable.id, name: agentsTable.name, description: agentsTable.description }).from(agentsTable));
  return all.filter((a) => callableAgentIds.includes(a.id)).map((a) => ({ name: a.name, description: a.description }));
}

/**
 * Stream a prompt agent session over SSE.
 *
 * @param agentId - The agent ID whose prompt is being edited
 * @param body    - Request body with model info, messages, etc.
 * @param stream  - Hono SSE stream to write events to
 */
export async function streamPromptAgent(agentId: string, body: PromptStreamRequest, stream: SSEStreamingApi, abortSignal?: AbortSignal): Promise<void> {
  const { providerId, modelId, messages } = body;

  // 1. Resolve model
  const model = await getChatModel(providerId, modelId);

  // 2. Build system prompt from agent data + connected tools/agents
  const agentRow = await getAgent(agentId);
  const assignments = await listAssignments(agentId);
  const connectedTools = assignments.filter((a) => a.toolId !== "builtin:call_agent").map((a) => ({ name: a.tool.name, label: a.tool.label, description: a.tool.description }));
  const callableAgentIds: string[] = (agentRow?.callableAgentIds as string[] | null) ?? [];
  const callableAgents = await loadCallableAgents(callableAgentIds);

  const aiSystemPrompt = buildPromptSystemPrompt({
    agentName: agentRow?.name,
    agentDescription: agentRow?.description,
    currentPrompt: agentRow?.systemPrompt,
    draftPrompt: agentRow?.systemPromptDraft,
    tools: connectedTools,
    callableAgents,
  });

  // 3. Build tools — generate_prompt writes a draft (not published) + emits WS
  // datatable is discovery-only so the prompt writer can reference real projects/tables/columns
  const tools: StructuredToolInterface[] = [makeGeneratePromptTool(agentId), browserTool, fetchUrlTool, makeDatatableTool(["list_projects", "get_schema"])];

  // 4. Create agent
  const agent = createAgent({
    model,
    tools,
    systemPrompt: aiSystemPrompt,
  });

  // 5. Build messages (include tool-call history for multi-turn)
  const baseMessages = buildLangChainMessages(messages);

  // 6. Stream via shared helper
  await streamAgentSSE({
    agent,
    messages: baseMessages,
    maxSteps: 10,
    stream,
    abortSignal,
  });
}
