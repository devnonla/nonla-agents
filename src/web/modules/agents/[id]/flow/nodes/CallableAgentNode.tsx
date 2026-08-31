import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { UserAvatar } from "src/components/UserAvatar";

export type CallableAgentNodeData = {
  name: string;
  avatar?: string | null;
  width?: number;
};

export type CallableAgentNodeType = Node<CallableAgentNodeData, "callableAgent">;

const NODE_H = 22;

export function CallableAgentNode({ data }: NodeProps<CallableAgentNodeType>) {
  return (
    <div className="relative flex items-center gap-2 overflow-visible whitespace-nowrap" style={{ height: NODE_H, minWidth: data.width }}>
      <Handle
        type="target"
        position={Position.Left}
        className="border-0! bg-transparent!"
        style={{
          top: NODE_H / 2,
          width: 1,
          height: 1,
          minWidth: 1,
          minHeight: 1,
          opacity: 0,
          transform: "translate(-50%, -50%)",
        }}
      />

      <UserAvatar avatar={data.avatar} name={data.name} size={NODE_H} className="block shrink-0 ring-1 ring-border" />

      <span className="text-xs leading-none font-semibold text-foreground">{data.name}</span>
    </div>
  );
}
