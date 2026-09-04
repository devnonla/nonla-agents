import { Switch } from "@nonla-agents/ui";
import { CpuIcon } from "@solar-icons/react/dynamic/cpu";
import { WidgetIcon } from "@solar-icons/react/dynamic/widget";
import { cn } from "src/common/lib/cn";
import type { MyMcpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";

export function MyMcpServerCard({
  server,
  toggling,
  onOpen,
  onToggleActive,
}: {
  server: MyMcpServer;
  toggling: boolean;
  onOpen: () => void;
  onToggleActive: (checked: boolean) => void;
}) {
  const tools = server.toolCount ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex min-h-47 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card p-5 text-left",
        "transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-secondary",
        "cursor-pointer",
        !server.isActive && "opacity-70 hover:opacity-100",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-edge-mcp/12 text-edge-mcp">
          <CpuIcon weight="BoldDuotone" size={20} />
        </div>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Switch size="small" checked={server.isActive} disabled={toggling} onChange={onToggleActive} aria-label={server.isActive ? "Disable" : "Enable"} />
        </div>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <h2 className="m-0 truncate text-lg font-semibold text-foreground">{server.name}</h2>
        <RenderIf condition={!!server.description?.trim()}>
          <p className="mt-1 m-0 line-clamp-2 text-[13px] text-tertiary-foreground">{server.description}</p>
        </RenderIf>
        <p className="mt-1 m-0 font-mono text-[12px] text-quaternary-foreground">{server.keyPrefix}…</p>
      </div>

      <div className="mt-5">
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <WidgetIcon size={12} />
          {tools} tool{tools === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
