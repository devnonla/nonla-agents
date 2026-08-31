import type { ReactNode } from "react";
import { AppLogo } from "src/components/AppLogo";

interface AgentPanelEmptyStateProps {
  children: ReactNode;
}

export function AgentPanelEmptyState({ children }: AgentPanelEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div aria-hidden className="text-foreground opacity-20">
        <AppLogo variant="current" size={48} />
      </div>
      <p className="m-0 max-w-52 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
