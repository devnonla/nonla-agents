/**
 * buildSystemPrompt.ts (server-side)
 *
 * Build system prompt from agent data + DB (memory tool hint, skills).
 * Runs entirely on server — no HTTP round-trips.
 *
 * Memory:
 *   - Instructions only — agent loads graph via `memory` tool when needed
 *
 * Skills (assigned):
 *   - Only name + description injected; body/references via read_skill tool
 *
 * Callable agents:
 *   Populated only from explicit UI selection (callableAgentIds).
 *   If no agents are explicitly selected → no delegation context.
 */

import { eq } from "drizzle-orm";
import { agents, getDb } from "../../../../common/db/client.js";
import { listAssignedSkillSummaries } from "../../../skills/skills.service.js";
import { callAgentToolName } from "../llm-tools/call-agent.tool.js";

type AgentLike = {
  id: string;
  name: string;
  systemPrompt: string | null | undefined;
};

type DelegateAgent = {
  id: string;
  name: string;
  description: string | null;
  teamName?: string;
};

type SkillSummary = { name: string; description: string };

type BuildSystemPromptOptions = {
  agentsToDelegate?: DelegateAgent[];
  skills?: SkillSummary[];
};

function buildRoleSection(systemPrompt: string): string {
  return `<role>
${systemPrompt}
</role>`;
}

function buildMemoryInstructions(): string {
  return `<memory_instructions>
You have a long-term memory tool: \`memory\`. It stores a small knowledge graph about this user — not a scratchpad.
Nothing is auto-injected. Call \`memory\` (search / neighbors / list) when you need to recall.

**When to save (rare):** stable preferences, people, projects, constraints, or explicit "remember this".
**Do NOT save:** task progress, research dumps, intermediate answers, playbooks (use Skills), or one-off details.
Prefer 0–2 nodes per turn. Prefer \`link\` / \`update_node\` over duplicate nodes.
Each node is one short \`content\` string (no type). Links use a short free-form \`relation\` (snake_case).

Actions: upsert_node, update_node, forget_node, link, unlink, search, neighbors, list.
</memory_instructions>`;
}

function buildBackgroundTasksInstructions(): string {
  return `<background_tasks>
Custom tools may return \`{ "status": "running", "taskId": "..." }\` if they take longer than ~2 minutes.
Do not re-invoke the same tool to poll. Use \`background_tasks\`:
- \`await\` (preferred) — wait up to timeout_ms for completion
- \`get\` / \`list\` — check status
- \`cancel\` — stop a running task
</background_tasks>`;
}

function buildSkillsSection(skills: SkillSummary[]): string | null {
  if (skills.length === 0) return null;
  const list = skills.map((s) => `- ${s.name} — ${s.description}`).join("\n");
  return `<skills>
When a skill matches the task, call \`read_skill({ name })\` to load full instructions.
Then follow any references named inside that content via \`read_skill({ name, reference })\`.

${list}
</skills>`;
}

function buildCallableAgentsSection(agentsToDelegate: DelegateAgent[]): string | null {
  if (agentsToDelegate.length === 0) return null;
  const memberList = agentsToDelegate
    .map((a) => {
      const desc = a.description ? ` — ${a.description}` : "";
      const toolName = callAgentToolName(a.id);
      return `- **${a.name}** → tool \`${toolName}\`${desc}`;
    })
    .join("\n");

  return `<callable_agents>
You can delegate tasks using these specialist tools (one tool per agent):

${memberList}

### Rules
- Call the tool that matches the specialist you need — do not invent tool names.
- When you need **multiple independent tasks**, call those tools in the SAME step (parallel).
- Only call specialists **sequentially** when one result is needed as input for the next.
- If an agent call fails, report the error clearly to the user.
</callable_agents>`;
}

function buildResponseFormat(): string {
  return `<response_format>
Always respond using **Markdown** formatting.
- Use headings, lists, bold, italic, code blocks, tables, etc. for clarity.
- When you need to visualize a graph, flowchart, or diagram, use a mermaid code block.
</response_format>`;
}

export function buildSystemPrompt(agent: AgentLike, options: BuildSystemPromptOptions = {}): string {
  const { agentsToDelegate, skills } = options;
  const parts: string[] = [];

  if (agent.systemPrompt) parts.push(buildRoleSection(agent.systemPrompt));
  parts.push(buildMemoryInstructions());
  parts.push(buildBackgroundTasksInstructions());

  const skillsSection = skills ? buildSkillsSection(skills) : null;
  if (skillsSection) parts.push(skillsSection);

  const callableSection = agentsToDelegate ? buildCallableAgentsSection(agentsToDelegate) : null;
  if (callableSection) parts.push(callableSection);

  parts.push(buildResponseFormat());
  return parts.join("\n\n");
}

/**
 * Resolve full system prompt for an agent directly from DB.
 */
export function resolveSystemPrompt(agentId: string, callableAgentIds?: string[]): string {
  const db = getDb();

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const effectiveCallableIds = callableAgentIds ?? (agent.callableAgentIds as string[] | null) ?? [];

  let agentsToDelegate: { id: string; name: string; description: string | null }[] | undefined;

  if (effectiveCallableIds.length > 0) {
    const all = db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).all();
    agentsToDelegate = all.filter((a) => effectiveCallableIds.includes(a.id));
  }

  const skillSummaries = listAssignedSkillSummaries(agentId);

  return buildSystemPrompt(agent, {
    agentsToDelegate,
    skills: skillSummaries,
  });
}
