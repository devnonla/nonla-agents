// ─── Call Agents Node ─────────────────────────────────────────────────────────
// Single card node (like Tools / MCP Servers). Click opens a popover listing other
// agents grouped by team, each with a Switch to enable/disable call_agent.

import { Popover, Switch } from "@nonla-agents/ui";
import { BotIcon } from "@solar-icons/react/dynamic/bot";
import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import { UserAvatar } from "src/components/UserAvatar";

export type CallAgentToggleItem = {
  id: string;
  name: string;
  avatar?: string | null;
  teamId: string | null;
  connected: boolean;
};

export type CallAgentTeamGroup = {
  id: string | null; // null = ungrouped
  name: string;
  agents: CallAgentToggleItem[];
};

export type CallAgentsNodeData = {
  teams: CallAgentTeamGroup[];
  width?: number;
  onToggleAgent: (agentId: string, enable: boolean) => void;
};

export type CallAgentsNodeType = Node<CallAgentsNodeData, "callAgents">;

const CALL_AGENT_COLOR = "var(--edge-call-agent)";

export function CallAgentsNode({ data }: NodeProps<CallAgentsNodeType>) {
  const [open, setOpen] = useState(false);

  const { connectedCount, totalCount } = useMemo(() => {
    const all = data.teams.flatMap((t) => t.agents);
    const connected = all.filter((a) => a.connected).length;
    return {
      connectedCount: connected,
      totalCount: all.length,
    };
  }, [data.teams]);

  const hasConnection = connectedCount > 0;

  return (
    <div className="relative" style={data.width ? { width: data.width } : undefined}>
      <Handle id="to-config" type="source" position={Position.Left} className="w-1.5! h-1.5! bg-transparent! border-0! opacity-0! left-0!" />

      {hasConnection && <Handle id="to-agents" type="source" position={Position.Right} className="border-0! bg-transparent!" style={{ top: "50%", right: 0, width: 1, height: 1, opacity: 0, transform: "translate(50%, -50%)" }} />}

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="right"
        arrow={{ pointAtCenter: true }}
        styles={{
          root: { width: 340 },
          container: {
            width: 340,
            padding: 0,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--edge-call-agent) 45%, transparent)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)",
            background: "var(--popover)",
          },
        }}
        content={
          <div className="nodrag nowheel nopan w-85">
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 border-b"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--edge-call-agent) 18%, transparent), color-mix(in srgb, var(--edge-call-agent) 8%, transparent))",
                borderBottomColor: "color-mix(in srgb, var(--edge-call-agent) 35%, transparent)",
                boxShadow: "inset 0 -1px 0 color-mix(in srgb, var(--edge-call-agent) 12%, transparent), 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 ring-1 ring-edge-call-agent/25" style={{ background: "color-mix(in srgb, var(--edge-call-agent) 22%, transparent)", color: CALL_AGENT_COLOR }}>
                <BotIcon weight="BoldDuotone" size={15} />
              </div>
              <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground truncate">Call Agents</div>
              <button type="button" className="nodrag nopan shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/40 transition-colors" aria-label="Close" onClick={() => setOpen(false)}>
                <CloseCircleIcon size={16} />
              </button>
            </div>

            <div className="max-h-105 overflow-y-auto py-1.5">
              {totalCount === 0 ? (
                <div className="px-3.5 py-6 text-[12px] text-muted-foreground text-center">No other agents available</div>
              ) : (
                data.teams.map((team) => (
                  <div key={team.id ?? "__ungrouped"} className="pb-1">
                    <div className="px-3.5 pt-2.5 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{team.name}</span>
                    </div>

                    {team.agents.map((agent) => (
                      <div key={agent.id} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted/40 transition-colors">
                        <UserAvatar avatar={agent.avatar} name={agent.name} size={22} className="shrink-0 ring-1 ring-border" />
                        <div className="min-w-0 flex-1 text-[13px] font-medium text-foreground truncate">{agent.name}</div>
                        <Switch size="small" checked={agent.connected} onChange={(checked) => data.onToggleAgent(agent.id, checked)} aria-label={`Toggle ${agent.name}`} />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <button type="button" className={`nodrag nopan relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-card px-2 py-3 text-center font-[inherit] transition-colors duration-150 hover:bg-muted/30 ${hasConnection ? "border-edge-call-agent/40" : "border-border"}`}>
          <BotIcon weight="BoldDuotone" size={20} className="block" style={{ color: CALL_AGENT_COLOR }} />
          <div className="w-full text-[11px] font-semibold leading-none text-foreground">Call Agents</div>
        </button>
      </Popover>
    </div>
  );
}
