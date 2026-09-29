import { Empty } from "devnonla-ui";
import type { ReactNode } from "react";

export function SkillsEmptyState({ children }: { children?: ReactNode }) {
  return (
    <Empty className="rounded-2xl border border-dashed border-border-subtle bg-card/50 px-5 py-16" description="No skills yet. Write a playbook the agent can follow.">
      {children}
    </Empty>
  );
}
