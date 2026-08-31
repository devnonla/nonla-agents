interface AgentsSectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export function AgentsSectionHeader({ icon, title, actions }: AgentsSectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <h2 className="m-0 truncate text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {actions}
    </div>
  );
}
