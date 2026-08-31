// ─── MCP Server Branch Node ───────────────────────────────────────────────────
// Mid-level display node under MCP Servers. Only shown when ≥1 tool on this
// server is connected. Fans out further to individual tool leaf nodes.

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

export type McpServerBranchNodeData = {
  name: string;
  toolCount: number;
  width?: number;
};

export type McpServerBranchNodeType = Node<McpServerBranchNodeData, "mcpServerBranch">;

export function McpServerBranchNode({ data }: NodeProps<McpServerBranchNodeType>) {
  return (
    <div className="relative flex items-center gap-2 px-3 py-2 rounded-md border bg-card border-edge-mcp/35" style={data.width ? { width: data.width } : undefined}>
      <Handle type="target" position={Position.Left} className="w-1.5! h-1.5! bg-transparent! border-0! opacity-0!" />
      <Handle type="source" position={Position.Right} id="to-tools" className="w-1.5! h-1.5! bg-transparent! border-0! opacity-0! right-0!" />

      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground leading-[1.3] truncate">{data.name}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {data.toolCount} tool{data.toolCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
