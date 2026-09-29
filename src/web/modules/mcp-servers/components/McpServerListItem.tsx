import { FluentIcon, Switch, Tooltip } from "devnonla-ui";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";

export type McpStatusTone = "live" | "off" | "error";

export function getServerStatus(server: McpServer): McpStatusTone {
  if (server.lastSyncError) return "error";
  if (!server.isActive) return "off";
  return "live";
}

export function toolCountOf(server: McpServer): number {
  return server.tools?.length ?? server.toolCount ?? 0;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function McpServerListItem({
  server,
  selected,
  toggling,
  onSelect,
  onToggleActive,
}: {
  server: McpServer;
  selected: boolean;
  toggling: boolean;
  onSelect: () => void;
  onToggleActive: (checked: boolean) => void;
}) {
  const tone = getServerStatus(server);
  const tools = toolCountOf(server);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn("group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", selected ? "bg-white/70 text-foreground" : "hover:bg-white/40")}
    >
      <span className={cn("size-2 shrink-0 rounded-full", tone === "live" && "bg-link motion-safe:animate-pulse", tone === "error" && "bg-destructive", tone === "off" && "bg-muted-foreground")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="m-0 truncate text-sm font-medium text-foreground">{server.name}</p>
          <RenderIf condition={tone === "error" && !!server.lastSyncError}>
            <Tooltip title={server.lastSyncError}>
              <span className="inline-flex text-destructive">
                <FluentIcon name="error-circle-24" size={13} />
              </span>
            </Tooltip>
          </RenderIf>
        </div>
        <p className="m-0 truncate font-mono text-[11px] text-muted-foreground">{hostOf(server.url)}</p>
        <RenderIf condition={!server.lastSyncError}>
          <p className="mt-0.5 m-0 text-[11px] tabular-nums text-muted-foreground">
            {tools} tool{tools === 1 ? "" : "s"}
          </p>
        </RenderIf>
      </div>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Switch size="small" checked={server.isActive} disabled={toggling} onChange={onToggleActive} aria-label={server.isActive ? "Disable" : "Enable"} />
      </div>
    </div>
  );
}
