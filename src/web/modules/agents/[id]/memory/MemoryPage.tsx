import { Button, Empty, Input, Modal, message } from "devnonla-ui";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { AgentMemoryResponse, MemoryEdge, MemoryNode, MemoryOwnerBranch } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { useAgentDetailContext } from "../common/agentDetailContext";

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

function previewTitle(text: string) {
  const line = text.trim().split(/\n/)[0] ?? "";
  if (!line) return "Memory";
  return line.length > 72 ? `${line.slice(0, 71)}…` : line;
}

export function MemoryPage() {
  const { id } = useAgentDetailContext();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AgentMemoryResponse | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemoryNode | null>(null);
  const [contentDraft, setContentDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authorizedFetch(`/api/agents/${id}/memory`);
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as AgentMemoryResponse);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshQuiet = useCallback(async () => {
    if (!id) return;
    try {
      const res = await authorizedFetch(`/api/agents/${id}/memory`);
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as AgentMemoryResponse);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to refresh memory");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = data?.branches ?? [];

  useEffect(() => {
    if (branches.length === 0) {
      setOwnerId(null);
      return;
    }
    if (!ownerId || !branches.some((b) => b.ownerId === ownerId)) {
      setOwnerId(branches[0]!.ownerId);
    }
  }, [branches, ownerId]);

  const nodes = useMemo(() => (data?.nodes ?? []).filter((n) => n.ownerId === ownerId), [data?.nodes, ownerId]);
  const edges = useMemo(() => (data?.edges ?? []).filter((e) => e.ownerId === ownerId), [data?.edges, ownerId]);

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

  const saveNode = async () => {
    if (!id || !selected || !contentDraft.trim()) return;
    setSaving(true);
    try {
      const res = await authorizedFetch(`/api/agents/${id}/memory/nodes/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ content: contentDraft.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      message.success("Memory updated");
      setSelected(null);
      await refreshQuiet();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const removeNode = () => {
    if (!id || !selected) return;
    Modal.confirm({
      title: `Forget "${previewTitle(selected.content)}"?`,
      content: "This also removes its links.",
      okText: "Forget",
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authorizedFetch(`/api/agents/${id}/memory/nodes/${selected.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        message.success("Forgotten");
        setSelected(null);
        await refreshQuiet();
      },
    });
  };

  const removeEdge = (edge: MemoryEdge) => {
    if (!id) return;
    Modal.confirm({
      title: "Remove this link?",
      okText: "Remove",
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authorizedFetch(`/api/agents/${id}/memory/edges/${edge.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        message.success("Link removed");
        await refreshQuiet();
      },
    });
  };

  if (!id) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="m-0 text-sm text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="m-0 text-sm text-muted-foreground">Loading memory…</p>
      </div>
    );
  }

  if (!data || branches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <Empty description="No user memory yet" />
          <p className="m-0 mt-2 text-xs text-muted-foreground">Preferences, people, and projects appear here as the agent remembers them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex h-full w-52 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5">
          <p className="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Users</p>
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
                <span className="shrink-0 text-[11px] text-muted-foreground">{branch.nodeCount}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center">
              <Empty description="No memories for this user" />
              <p className="m-0 mt-2 text-xs text-muted-foreground">The agent will add notes here as it learns.</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {nodes.map((node) => {
              const linkCount = edges.filter((e) => e.fromId === node.id || e.toId === node.id).length;
              return (
                <button key={node.id} type="button" onClick={() => openNode(node)} className="cursor-pointer rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left font-[inherit] transition-colors hover:border-border hover:bg-muted/40">
                  <p className="m-0 whitespace-pre-wrap text-[13px] leading-snug text-foreground">{node.content}</p>
                  {linkCount > 0 ? (
                    <p className="m-0 mt-1.5 text-[11px] text-muted-foreground">
                      {linkCount} link{linkCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!selected}
        title="Memory"
        onCancel={() => setSelected(null)}
        onOk={() => void saveNode()}
        okText="Save"
        confirmLoading={saving}
        destroyOnHidden
        width={520}
        footer={
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={removeNode} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2 py-1 text-[12px] text-destructive hover:bg-destructive/10">
              <X size={13} />
              Forget
            </button>
            <div className="flex gap-2">
              <Button onClick={() => setSelected(null)}>Cancel</Button>
              <Button type="primary" loading={saving} onClick={() => void saveNode()}>
                Save
              </Button>
            </div>
          </div>
        }
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
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
