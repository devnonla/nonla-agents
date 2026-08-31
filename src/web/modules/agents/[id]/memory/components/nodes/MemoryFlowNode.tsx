import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { cn } from "src/common/lib/cn";

export type MemoryFlowNodeData = {
  content: string;
  selected?: boolean;
};

export type MemoryFlowNodeType = Node<MemoryFlowNodeData, "memoryNode">;

const SIDES: { id: string; position: Position }[] = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

export function MemoryFlowNode({ data, selected }: NodeProps<MemoryFlowNodeType>) {
  return (
    <div className={cn("relative w-50 rounded-xl border border-border bg-card px-3 py-2.5 transition-[box-shadow,border-color]", selected || data.selected ? "border-brand/60 shadow-[0_0_0_1px_rgba(234,179,8,0.25)]" : "")}>
      {SIDES.map((side) => (
        <Handle key={`t-${side.id}`} id={`t-${side.id}`} type="target" position={side.position} className="h-2! w-2! border-border! bg-muted! opacity-0!" />
      ))}
      {SIDES.map((side) => (
        <Handle key={`s-${side.id}`} id={`s-${side.id}`} type="source" position={side.position} className="h-2! w-2! border-border! bg-muted! opacity-0!" />
      ))}

      <p className="m-0 line-clamp-4 text-[13px] font-medium leading-snug text-foreground">{data.content}</p>
    </div>
  );
}
