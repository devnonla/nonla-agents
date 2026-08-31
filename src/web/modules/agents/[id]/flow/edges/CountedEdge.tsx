import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";

export type CountedEdgeData = {
  count?: number;
  color?: string;
};

export type CountedEdgeType = Edge<CountedEdgeData>;

export function CountedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps<CountedEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const count = data?.count ?? 0;
  const color = data?.color ?? (typeof style?.stroke === "string" ? style.stroke : undefined);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      {count > 0 && color && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: color,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {count}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
