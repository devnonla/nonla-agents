import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from "@xyflow/react";

export type RelationEdgeData = {
  relation: string;
  /** Absolute ELK orthogonal waypoints (flow coordinates). */
  points?: { x: number; y: number }[];
  bend?: number;
};

export type RelationEdgeType = Edge<RelationEdgeData, "relation">;

function pathFromPoints(points: { x: number; y: number }[]): [string, number, number] {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let d = `M ${first.x},${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` L ${p.x},${p.y}`;
  }
  // Label at geometric midpoint along polyline length
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }
  let remain = total / 2;
  let labelX = (first.x + last.x) / 2;
  let labelY = (first.y + last.y) / 2;
  for (let i = 1; i < points.length; i++) {
    const len = segLens[i - 1]!;
    if (remain <= len) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const t = len === 0 ? 0 : remain / len;
      labelX = a.x + (b.x - a.x) * t;
      labelY = a.y + (b.y - a.y) * t;
      break;
    }
    remain -= len;
  }
  return [d, labelX, labelY];
}

export function RelationEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps<RelationEdgeType>) {
  const points = data?.points;
  const [edgePath, labelX, labelY] =
    points && points.length >= 2
      ? pathFromPoints(points)
      : getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 12,
          offset: 28,
        });

  const relation = data?.relation ?? "related_to";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "var(--brand)" : "color-mix(in srgb, var(--foreground) 28%, transparent)",
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute z-10 rounded-md border border-border/70 bg-card/95 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {relation.replace(/_/g, " ")}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
