// ─── Config: Danger zone ──────────────────────────────────────────────────────
// Destructive actions for the current agent.

import { Button, Popconfirm } from "devnonla-ui";
import { X } from "lucide-react";
import { useAgentDetailContext } from "../../common/agentDetailContext";

export function ConfigDangerPanel() {
  const { agent, onDelete } = useAgentDetailContext();

  return (
    <section className="max-w-lg rounded-2xl border border-destructive/30 bg-white/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      <p className="m-0 text-[13px] font-semibold text-foreground">Delete agent</p>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">Permanently delete this agent and all conversations and tasks. This cannot be undone.</p>
      <Popconfirm title={`Delete "${agent.name}"?`} description="This action cannot be undone. All conversations and tasks will be lost." okText="Delete" okType="danger" cancelText="Cancel" onConfirm={() => void onDelete()}>
        <Button size="small" danger icon={<X size={14} />}>
          Delete agent
        </Button>
      </Popconfirm>
    </section>
  );
}
