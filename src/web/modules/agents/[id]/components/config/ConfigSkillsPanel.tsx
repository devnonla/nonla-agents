// ─── Config: Skills Panel ─────────────────────────────────────────────────────
// Toggle skills assigned to this agent.

import { Switch } from "devnonla-ui";
import { useMemo } from "react";
import type { Skill } from "src/common/types";
import { useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { buildSkillItems } from "../../common/configGroups";

export function ConfigSkillsPanel() {
  const { skillAssignments, onToggleSkill } = useAgentDetailContext();
  const allSkills = useAppSelector((s) => s.skills.items) as Skill[];

  const skills = useMemo(() => buildSkillItems({ allSkills, skillAssignments }), [allSkills, skillAssignments]);

  return (
    <section className="max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      {skills.length === 0 ? (
        <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">No skills yet — create some in Skills</div>
      ) : (
        <div className="w-full">
          {skills.map((skill) => (
            <div key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/50">
              <div className="min-w-0 truncate text-[13px] font-medium text-foreground">{skill.label}</div>
              <Switch size="small" className="shrink-0" checked={skill.connected} onChange={(checked) => onToggleSkill(skill.id, checked)} aria-label={`Toggle ${skill.label}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
