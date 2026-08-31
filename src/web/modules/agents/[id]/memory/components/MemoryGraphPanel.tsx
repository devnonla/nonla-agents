import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { type Node, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Empty, Input, Modal, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { AgentMemoryResponse, MemoryEdge, MemoryNode, MemoryOwnerBranch } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { RelationEdge, type RelationEdgeType } from "./edges/RelationEdge";
import { buildFlowElements } from "./layoutGraph";
import { MemoryFlowNode } from "./nodes/MemoryFlowNode";

const flowNodeTypes = { memoryNode: MemoryFlowNode };
const flowEdgeTypes = { relation: RelationEdge };

const SESSION_SIDEBAR_W = 220;

interface MemoryGraphPanelProps {
  agentId: string;
  data: AgentMemoryResponse;
  onRefresh: () => Promise<void>;
}

function GuestAvatar({ size = 22 }: { size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 20c0-3.3 3.1-5 7-5s7 1.7 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function isGuestBranch(branch: MemoryOwnerBranch): boolean {
  return branch.isGuest === true || branch.ownerId.startsWith("guest:");
}

function MemoryFlowCanvas({
  agentId,
  nodes,
  edges,
  onRefresh,
}: {
  agentId: string;
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  onRefresh: () => Promise<void>;
}) {
  const { fitView } = useReactFlow();
  const [selected, setSelected] = useState<MemoryNode | null>(null);
  const [contentDraft, setContentDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<RelationEdgeType>([]);

  useEffect(() => {
    let cancelled = false;
    void buildFlowElements(nodes, edges).then((built) => {
      if (cancelled) return;
      setFlowNodes(built.flowNodes as Node[]);
      setFlowEdges(built.flowEdges);
      requestAnimationFrame(() => fitView({ padding: 0.18, duration: 280 }));
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges, setFlowNodes, setFlowEdges, fitView]);

  const related = useMemo(() => {
    if (!selected) return [] as { edge: MemoryEdge; other: MemoryNode | undefined; direction: "out" | "in" }[];
    return edges
      .filter((e) => e.fromId === selected.id || e.toId === selected.id)
      .map((edge) => {
        const out = edge.fromId === selected.id;
        const otherId = out ? edge.toId : edge.fromId;
        return {
          edge,
          other: nodes.find((n) => n.id === otherId),
          direction: out ? ("out" as const) : ("in" as const),
        };
      });
  }, [selected, edges, nodes]);

  const openNode = (node: MemoryNode) => {
    setSelected(node);
    setContentDraft(node.content);
  };

  const previewTitle = (text: string) => {
    const line = text.trim().split(/\n/)[0] ?? "";
    if (!line) return "Memory node";
    return line.length > 48 ? `${line.slice(0, 47)}…` : line;
  };

  const saveNode = async () => {
    if (!selected || !contentDraft.trim()) return;
    setSaving(true);
    try {
      const res = await authorizedFetch(`/api/agents/${agentId}/memory/nodes/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          content: contentDraft.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      message.success("Memory updated");
      setSelected(null);
      await onRefresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const removeNode = () => {
    if (!selected) return;
    Modal.confirm({
      title: `Forget "${previewTitle(selected.content)}"?`,
      content: "This also removes its links.",
      okText: "Forget",
      okType: "danger",
      onOk: async () => {
        const res = await authorizedFetch(`/api/agents/${agentId}/memory/nodes/${selected.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await res.text());
        message.success("Forgotten");
        setSelected(null);
        await onRefresh();
      },
    });
  };

  const removeEdge = (edge: MemoryEdge) => {
    Modal.confirm({
      title: "Remove this link?",
      okText: "Remove",
      okType: "danger",
      onOk: async () => {
        const res = await authorizedFetch(`/api/agents/${agentId}/memory/edges/${edge.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await res.text());
        message.success("Link removed");
        await onRefresh();
      },
    });
  };

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <Empty description="No nodes for this user" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          <p className="m-0 mt-2 text-xs text-muted-foreground">The agent will grow this graph as it remembers people, projects, and preferences.</p>
        </div>
      </div>
    );
  }

  const handleNodesChange: typeof onNodesChange = (changes) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type === "position" && c.dragging)) {
      setFlowEdges((eds) => eds.map((edge) => (edge.data?.points ? { ...edge, data: { ...edge.data, points: undefined } } : edge)));
    }
  };

  return (
    <>
      <div className="h-full w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={flowNodeTypes}
          edgeTypes={flowEdgeTypes}
          onNodeClick={(_, node: Node) => {
            const mem = nodes.find((n) => n.id === node.id);
            if (mem) openNode(mem);
          }}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
          minZoom={0.25}
          maxZoom={1.6}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          className="h-full w-full bg-transparent!"
        />
      </div>

      <Modal
        open={!!selected}
        title="Memory node"
        onCancel={() => setSelected(null)}
        onOk={() => void saveNode()}
        okText="Save"
        confirmLoading={saving}
        destroyOnHidden
        width={520}
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={removeNode} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2 py-1 text-[12px] text-destructive hover:bg-destructive/10">
              <TrashBinMinimalisticIcon size={13} />
              Forget
            </button>
            <div className="flex gap-2">
              <CancelBtn />
              <OkBtn />
            </div>
          </div>
        )}
      >
        <div className="flex flex-col gap-3 pt-1">
          <Input.TextArea value={contentDraft} onChange={(e) => setContentDraft(e.target.value)} placeholder="Who / what — keep it short…" autoSize={{ minRows: 3, maxRows: 8 }} />

          {related.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Links</p>
              {related.map(({ edge, other, direction }) => (
                <div key={edge.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                    <span className="text-muted-foreground">
                      {direction === "out" ? "→" : "←"} {edge.relation}
                    </span>{" "}
                    {other ? previewTitle(other.content) : "Unknown"}
                  </span>
                  <button type="button" onClick={() => removeEdge(edge)} className="cursor-pointer border-none bg-transparent p-0 text-muted-foreground hover:text-destructive" aria-label="Remove link">
                    <TrashBinMinimalisticIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

export function MemoryGraphPanel({ agentId, data, onRefresh }: MemoryGraphPanelProps) {
  const branches = data.branches ?? [];
  const [ownerId, setOwnerId] = useState<string | null>(branches[0]?.ownerId ?? null);

  useEffect(() => {
    if (branches.length === 0) {
      setOwnerId(null);
      return;
    }
    if (!ownerId || !branches.some((b) => b.ownerId === ownerId)) {
      setOwnerId(branches[0]!.ownerId);
    }
  }, [branches, ownerId]);

  const ownerNodes = useMemo(() => data.nodes.filter((n) => n.ownerId === ownerId), [data.nodes, ownerId]);
  const ownerEdges = useMemo(() => data.edges.filter((e) => e.ownerId === ownerId), [data.edges, ownerId]);

  if (branches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <Empty description="No user memory yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          <p className={cn("m-0 mt-2 text-xs text-muted-foreground")}>Preferences, people, and projects appear here as a knowledge graph.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-card" style={{ width: SESSION_SIDEBAR_W }}>
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5">
          <p className="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Sessions</p>
        </div>
        <div className="min-h-0 flex-1 space-y-px overflow-y-auto p-1.5">
          {branches.map((branch) => {
            const active = branch.ownerId === ownerId;
            const guest = isGuestBranch(branch);
            return (
              <button
                key={branch.ownerId}
                type="button"
                onClick={() => setOwnerId(branch.ownerId)}
                className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-2.5 py-2 text-left font-[inherit] transition-colors", active ? "bg-primary/8 text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground")}
              >
                {guest ? <GuestAvatar size={22} /> : <UserAvatar avatar={branch.avatar} name={branch.label} size={22} />}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{branch.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1">
        <div className="absolute inset-0">
          <ReactFlowProvider>
            <MemoryFlowCanvas agentId={agentId} nodes={ownerNodes} edges={ownerEdges} onRefresh={onRefresh} />
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
