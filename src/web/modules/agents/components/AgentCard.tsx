import type { MenuProps } from "@nonla-agents/ui";
import { Dropdown } from "@nonla-agents/ui";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { useMemo, useState } from "react";
import type { AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { UserAvatar } from "src/components/UserAvatar";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { agentMenuItems } from "src/modules/agents/components/agentMenuItems";
import { useAppDispatch, useAppSelector } from "src/store/store";

function modelLabel(aiModel: string | null): string {
  if (!aiModel) return "No model";
  return aiModel.split("/").pop() || aiModel;
}

export interface AgentCardProps {
  agent: AgentListItem;
  onOpen: () => void;
  dragging?: boolean;
}

export function AgentCard({ agent, onOpen, dragging }: AgentCardProps) {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems: MenuProps["items"] = useMemo(() => agentMenuItems({ agent, teams, dispatch }), [agent, dispatch, teams]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={dragging ? undefined : onOpen}
      onKeyDown={(e) => {
        if (dragging) return;
        if (e.key === "Enter" || e.key === "") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group relative flex min-h-56 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-border-subtle bg-card px-6 py-10 text-center transition-[border-color,background-color,box-shadow] duration-200 hover:border-brand/35 hover:bg-secondary cursor-grab active:cursor-grabbing ${
        dragging ? "cursor-grabbing shadow-xl ring-1 ring-brand/35" : ""
      }`}
    >
      <RenderIf condition={agent.isPublic}>
        <span title="Published" className="absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-success/15 text-success">
          <GlobalIcon size={14} />
        </span>
      </RenderIf>

      <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Dropdown trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems, style: { minWidth: 160 } }}>
          <button
            type="button"
            aria-label="Agent actions"
            title="Agent actions"
            className={`flex size-7 items-center justify-center rounded-md border-none bg-transparent text-muted-foreground transition-[opacity,background-color,color] duration-150 cursor-pointer hover:bg-muted hover:text-foreground focus-visible:opacity-100 ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MenuDotsIcon size={15} weight="Bold" />
          </button>
        </Dropdown>
      </div>

      <div className={`rounded-full p-0.75 transition-colors duration-200 ${agent.isPublic ? "bg-brand/30" : "bg-border group-hover:bg-brand/25"}`}>
        <div className="rounded-full bg-card p-0.5">
          <UserAvatar avatar={agent.avatar} name={agent.name} size={88} />
        </div>
      </div>

      <div className="flex min-w-0 w-full flex-col items-center gap-1.5">
        <span className="w-full truncate text-lg font-semibold text-foreground">{agent.name}</span>
        <span className="truncate font-mono text-sm text-muted-foreground">{modelLabel(agent.aiModel)}</span>
      </div>
    </div>
  );
}
