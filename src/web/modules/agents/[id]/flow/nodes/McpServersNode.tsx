// ─── MCP Servers Node ─────────────────────────────────────────────────────────
// Single card node (like Tools). Click opens a popover listing MCP tools
// grouped by server (tree lines), each with a Switch. Connected tools fan out as children.

import { Popover, Switch } from "@nonla-agents/ui";
import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { Planet2Icon } from "@solar-icons/react/dynamic/planet-2";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import { cn } from "src/common/lib/cn";

export type McpToolToggleItem = {
  id: string;
  label: string;
  connected: boolean;
};

export type McpServerGroup = {
  id: string;
  name: string;
  tools: McpToolToggleItem[];
};

export type McpServersNodeData = {
  groups: McpServerGroup[];
  width?: number;
  onToggleTool: (toolId: string, enable: boolean) => void;
};

export type McpServersNodeType = Node<McpServersNodeData, "mcpServers">;

const MCP_COLOR = "var(--edge-mcp)";
const TREE_STROKE = "text-muted-foreground/40";
const TREE_LINE_FILL = "bg-muted-foreground/40";

function TreeGuide({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("pointer-events-none relative w-5 shrink-0 self-stretch", TREE_STROKE)} aria-hidden>
      {isLast ? (
        <>
          <div className={cn("absolute left-1/2 top-0 w-px -translate-x-1/2", TREE_LINE_FILL, "h-[calc(50%-6px)]")} />
          <svg className="absolute left-[calc(50%-0.5px)] top-[calc(50%-6px)] overflow-visible" width="12" height="7" viewBox="0 0 12 7" fill="none">
            <path d="M0.5 0 V1 Q0.5 6.5 6 6.5 H12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </>
      ) : (
        <>
          <div className={cn("absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2", TREE_LINE_FILL)} />
          <div className={cn("absolute left-1/2 top-1/2 h-px w-2.5 -translate-y-1/2", TREE_LINE_FILL)} />
        </>
      )}
    </div>
  );
}

export function McpServersNode({ data }: NodeProps<McpServersNodeType>) {
  const [open, setOpen] = useState(false);

  const { connectedCount, totalCount } = useMemo(() => {
    const all = data.groups.flatMap((g) => g.tools);
    return {
      connectedCount: all.filter((t) => t.connected).length,
      totalCount: all.length,
    };
  }, [data.groups]);

  const hasConnection = connectedCount > 0;

  return (
    <div className="relative" style={data.width ? { width: data.width } : undefined}>
      <Handle id="to-config" type="source" position={Position.Left} className="w-1.5! h-1.5! bg-transparent! border-0! opacity-0! left-0!" />

      {hasConnection && <Handle id="to-servers" type="source" position={Position.Right} className="border-0! bg-transparent!" style={{ top: "50%", right: 0, width: 1, height: 1, opacity: 0, transform: "translate(50%, -50%)" }} />}

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="right"
        arrow={{ pointAtCenter: true }}
        styles={{
          root: { width: "max-content", minWidth: 280, maxWidth: 560 },
          container: {
            width: "max-content",
            minWidth: 280,
            maxWidth: 560,
            padding: 0,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--edge-mcp) 45%, transparent)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)",
            background: "var(--popover)",
          },
        }}
        content={
          <div className="nodrag nowheel nopan min-w-70 w-max max-w-140">
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 border-b"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--edge-mcp) 18%, transparent), color-mix(in srgb, var(--edge-mcp) 8%, transparent))",
                borderBottomColor: "color-mix(in srgb, var(--edge-mcp) 35%, transparent)",
                boxShadow: "inset 0 -1px 0 color-mix(in srgb, var(--edge-mcp) 12%, transparent), 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 ring-1 ring-edge-mcp/25" style={{ background: "color-mix(in srgb, var(--edge-mcp) 22%, transparent)", color: MCP_COLOR }}>
                <Planet2Icon weight="BoldDuotone" size={15} />
              </div>
              <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground truncate">MCP Servers</div>
              <button type="button" className="nodrag nopan shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/40 transition-colors" aria-label="Close" onClick={() => setOpen(false)}>
                <CloseCircleIcon size={16} />
              </button>
            </div>

            <div className="max-h-105 overflow-y-auto py-1.5">
              {totalCount === 0 ? (
                <div className="px-3.5 py-6 text-[12px] text-muted-foreground text-center">No MCP tools available</div>
              ) : (
                data.groups.map((group) => (
                  <div key={group.id} className="w-full pb-1.5">
                    <div className="px-3.5 pt-2.5 pb-2 pl-5.5">
                      <span className="whitespace-nowrap text-[10px] font-bold uppercase text-muted-foreground">{group.name}</span>
                    </div>

                    <div className="w-full px-3.5">
                      {group.tools.map((tool, index) => {
                        const isLast = index === group.tools.length - 1;
                        return (
                          <button
                            key={tool.id}
                            type="button"
                            className="nodrag nopan flex w-full cursor-pointer items-stretch border-0 bg-transparent p-0 text-left font-[inherit] hover:bg-muted/80 transition-colors"
                            onClick={() => data.onToggleTool(tool.id, !tool.connected)}
                            aria-pressed={tool.connected}
                            aria-label={`Toggle ${group.name} → ${tool.label}`}
                          >
                            <TreeGuide isLast={isLast} />
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-2.5 pr-0.5">
                              <div className="whitespace-nowrap text-[13px] font-medium text-foreground">{tool.label}</div>
                              <Switch size="small" className="shrink-0 pointer-events-none" checked={tool.connected} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <button type="button" className={`nodrag nopan relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-card px-2 py-3 text-center font-[inherit] transition-colors duration-150 hover:bg-muted/30 ${hasConnection ? "border-edge-mcp/40" : "border-border"}`}>
          <Planet2Icon weight="BoldDuotone" size={20} style={{ color: MCP_COLOR }} />
          <div className="w-full text-[11px] font-semibold leading-tight text-foreground">MCP Servers</div>
        </button>
      </Popover>
    </div>
  );
}
