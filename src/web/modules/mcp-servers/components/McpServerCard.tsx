import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { PlugCircleIcon } from "@solar-icons/react/dynamic/plug-circle";
import { WidgetIcon } from "@solar-icons/react/dynamic/widget";
import { Switch, Tooltip } from "antd";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";

export type McpStatusTone = "live" | "off" | "error";

export function getServerStatus(server: McpServer): McpStatusTone {
  if (!server.isActive) return "off";
  if (server.lastSyncError) return "error";
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

function pathOf(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    const path = `${pathname}${search}`;
    return path === "/" ? "" : path;
  } catch {
    return "";
  }
}

export function McpServerCard({
  server,
  toggling,
  onOpen,
  onToggleActive,
}: {
  server: McpServer;
  toggling: boolean;
  onOpen: () => void;
  onToggleActive: (checked: boolean) => void;
}) {
  const tone = getServerStatus(server);
  const tools = toolCountOf(server);
  const path = pathOf(server.url);

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
        tone === "off" && "opacity-70 hover:opacity-100",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
          <PlugCircleIcon weight="BoldDuotone" size={20} />
        </div>

        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Switch size="small" checked={server.isActive} disabled={toggling} onChange={onToggleActive} aria-label={server.isActive ? "Disable" : "Enable"} />
        </div>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="m-0 truncate text-lg font-semibold text-foreground">{server.name}</h2>
          <RenderIf condition={tone === "error" && !!server.lastSyncError}>
            <Tooltip title={server.lastSyncError}>
              <span className="inline-flex text-destructive">
                <DangerCircleIcon size={15} />
              </span>
            </Tooltip>
          </RenderIf>
        </div>
        <p className="mt-1 m-0 truncate font-mono text-[12px] text-tertiary-foreground">
          <span className="text-muted-foreground">{hostOf(server.url)}</span>
          <RenderIf condition={!!path}>
            <span className="text-quaternary-foreground">{path}</span>
          </RenderIf>
        </p>
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
