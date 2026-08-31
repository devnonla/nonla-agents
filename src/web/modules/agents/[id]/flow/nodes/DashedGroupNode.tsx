// ─── Dashed Group Node ────────────────────────────────────────────────────────
// Purely visual backdrop with a dashed border and label.
// Does NOT interact — pointer events pass through to nodes inside.

import type { Node, NodeProps } from "@xyflow/react";

export type DashedGroupNodeData = {
  label: string;
  color: string; // accent color
  width: number;
  height: number;
};

export type DashedGroupNodeType = Node<DashedGroupNodeData, "dashedGroup">;

export function DashedGroupNode({ data }: NodeProps<DashedGroupNodeType>) {
  return (
    <div
      className="rounded-md pointer-events-none"
      style={{
        width: data.width,
        height: data.height,
        border: `1.5px dashed color-mix(in srgb, ${data.color} 15%, transparent)`,
      }}
    >
      <div className="px-3 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `color-mix(in srgb, ${data.color} 50%, transparent)` }}>
          {data.label}
        </span>
      </div>
    </div>
  );
}
