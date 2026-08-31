import { type Edge, MarkerType, type Node, Position } from "@xyflow/react";
import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { MemoryEdge, MemoryNode } from "src/common/types";
import type { RelationEdgeData } from "./edges/RelationEdge";
import type { MemoryFlowNodeData } from "./nodes/MemoryFlowNode";

const NODE_W = 200;
const NODE_H = 96;

const elk = new ELK();

type XY = { x: number; y: number };

function sideForVector(dx: number, dy: number): "left" | "right" | "top" | "bottom" {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

const SIDE_TO_POS: Record<string, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function extractEdgePoints(edge: ElkExtendedEdge): XY[] | null {
  const section = edge.sections?.[0];
  if (!section) return null;
  const points: XY[] = [{ x: section.startPoint.x, y: section.startPoint.y }];
  for (const bend of section.bendPoints ?? []) {
    points.push({ x: bend.x, y: bend.y });
  }
  points.push({ x: section.endPoint.x, y: section.endPoint.y });
  return points;
}

async function layoutWithElk(
  nodes: MemoryNode[],
  edges: MemoryEdge[],
): Promise<{
  positions: Map<string, XY>;
  edgePoints: Map<string, XY[]>;
}> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const layoutEdges = edges.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId) && e.fromId !== e.toId);

  const graph = await elk.layout({
    id: "memory",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.nodeNodeBetweenLayers": "160",
      "elk.spacing.nodeNode": "80",
      "elk.spacing.edgeEdge": "36",
      "elk.spacing.edgeNode": "40",
      "elk.spacing.edgeEdgeBetweenLayers": "42",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.padding": "[48,48,48,48]",
      "elk.separateConnectedComponents": "true",
    },
    children: nodes.map(
      (node): ElkNode => ({
        id: node.id,
        width: NODE_W,
        height: NODE_H,
      }),
    ),
    edges: layoutEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.fromId],
      targets: [edge.toId],
    })),
  });

  const positions = new Map<string, XY>();
  for (const child of graph.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const edgePoints = new Map<string, XY[]>();
  for (const edge of graph.edges ?? []) {
    const points = extractEdgePoints(edge as ElkExtendedEdge);
    if (points && points.length >= 2) edgePoints.set(edge.id, points);
  }

  return { positions, edgePoints };
}

export async function buildFlowElements(
  nodes: MemoryNode[],
  edges: MemoryEdge[],
): Promise<{
  flowNodes: Node<MemoryFlowNodeData, "memoryNode">[];
  flowEdges: Edge<RelationEdgeData, "relation">[];
}> {
  const { positions, edgePoints } = await layoutWithElk(nodes, edges);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const validEdges = edges.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId) && e.fromId !== e.toId);

  const centers = new Map<string, XY>();
  for (const node of nodes) {
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    centers.set(node.id, { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 });
  }

  const flowNodes: Node<MemoryFlowNodeData, "memoryNode">[] = nodes.map((node) => ({
    id: node.id,
    type: "memoryNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      content: node.content,
    },
  }));

  const flowEdges: Edge<RelationEdgeData, "relation">[] = validEdges.map((edge) => {
    const sc = centers.get(edge.fromId)!;
    const tc = centers.get(edge.toId)!;
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    const sourceSide = sideForVector(dx, dy);
    const targetSide = sideForVector(-dx, -dy);
    const points = edgePoints.get(edge.id);

    return {
      id: edge.id,
      source: edge.fromId,
      target: edge.toId,
      sourceHandle: `s-${sourceSide}`,
      targetHandle: `t-${targetSide}`,
      type: "relation",
      data: {
        relation: edge.relation,
        points,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: "color-mix(in srgb, var(--foreground) 35%, transparent)",
      },
      sourcePosition: SIDE_TO_POS[sourceSide],
      targetPosition: SIDE_TO_POS[targetSide],
    };
  });

  return { flowNodes, flowEdges };
}
