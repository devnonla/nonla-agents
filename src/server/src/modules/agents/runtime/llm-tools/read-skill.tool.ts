import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, skillReferences } from "../../../../common/db/client.js";
import { qall, qone } from "../../../../common/db/query.js";
import { getAssignedSkillByName } from "../../../skills/skills.service.js";

/**
 * Create read_skill for an agent — loads assigned skill body or a reference.
 */
export async function makeReadSkillTool(agentId: string): Promise<StructuredToolInterface> {
  return tool(
    async ({ name, reference }: { name: string; reference?: string }) => {
      const skillName = name?.trim();
      if (!skillName) {
        return JSON.stringify({ ok: false, error: "Provide skill `name`." });
      }

      const skill = await getAssignedSkillByName(agentId, skillName);
      if (!skill) {
        return JSON.stringify({
          ok: false,
          error: `Skill "${skillName}" is not assigned to this agent (or inactive).`,
        });
      }

      const refs = await qall(getDb().select({ name: skillReferences.name, title: skillReferences.title }).from(skillReferences).where(eq(skillReferences.skillId, skill.id)));

      if (reference?.trim()) {
        const refName = reference.trim();
        const row = await qone(
          getDb()
            .select()
            .from(skillReferences)
            .where(and(eq(skillReferences.skillId, skill.id), eq(skillReferences.name, refName))),
        );
        if (!row) {
          return JSON.stringify({
            ok: false,
            error: `Reference "${refName}" not found on skill "${skillName}".`,
            available_references: refs,
          });
        }
        return JSON.stringify({
          ok: true,
          skill: skill.name,
          reference: row.name,
          title: row.title,
          content: row.content,
        });
      }

      return JSON.stringify({
        ok: true,
        skill: skill.name,
        description: skill.description,
        content: skill.content,
        references: refs,
      });
    },
    {
      name: "read_skill",
      description: "Load an assigned skill's instructions. Call with `name` to get the main body (and available reference names). Then call again with `reference` to load a named reference mentioned in that body.",
      schema: z.object({
        name: z.string().describe("Skill name"),
        reference: z.string().optional().describe("Optional reference slug within the skill (e.g. api-details)"),
      }),
    },
  );
}

export const TOOL_DEF = {
  toolName: "read_skill",
  toolLabel: "Read Skill",
  description: "Load an assigned skill body or a skill reference. Use when a skill in <skills> matches the task.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Skill name" },
      reference: { type: "string", description: "Optional reference slug" },
    },
    required: ["name"],
  },
};
