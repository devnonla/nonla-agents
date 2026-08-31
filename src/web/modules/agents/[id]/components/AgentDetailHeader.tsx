import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { GraphIcon } from "@solar-icons/react/dynamic/graph";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { Modal, Popover } from "antd";
import { useCallback, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { Agent } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { TABS } from "../common/constants";

interface AgentDetailHeaderProps {
  id: string;
  agent: Agent;
  avatar: string | null;
  onDelete: () => void | Promise<void>;
}

export function AgentDetailHeader({ id, agent, avatar, onDelete }: AgentDetailHeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleBack = useCallback(() => {
    navigate("/agents");
  }, [navigate]);

  const openMemory = useCallback(() => {
    setMenuOpen(false);
    navigate(`/agents/${id}/memory`);
  }, [navigate, id]);

  const confirmDelete = useCallback(() => {
    setMenuOpen(false);
    Modal.confirm({
      title: `Delete "${agent.name}"?`,
      content: "This action cannot be undone. All conversations and tasks will be lost.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: onDelete,
    });
  }, [agent.name, onDelete]);

  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 px-2 py-2 bg-background shrink-0">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />

      <div className="relative z-1 flex items-center gap-2 h-8 min-w-0 pl-1">
        <button type="button" className="flex items-center justify-center size-7 shrink-0 rounded-md border-none bg-transparent text-muted-foreground cursor-pointer transition-colors duration-150 font-[inherit] hover:bg-muted/70 hover:text-foreground" onClick={handleBack} aria-label="Back to agents">
          <AltArrowLeftIcon size={14} />
        </button>
        <UserAvatar avatar={avatar ?? agent.avatar} name={agent.name} size={18} className="shrink-0" />
        <span className="min-w-0 truncate text-[13px] font-medium leading-none text-tertiary-foreground">{agent.name}</span>
      </div>

      <nav className="relative z-1 flex items-end gap-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const to = tab.path ? `/agents/${id}/${tab.path}` : `/agents/${id}`;
          return (
            <NavLink
              key={tab.id}
              to={to}
              end={!tab.path}
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-1.5 h-8 px-3.5 text-[13px] font-medium leading-none no-underline border-none outline-none focus:outline-none transition-colors duration-150",
                  isActive ? "bg-card text-foreground rounded" : "bg-transparent text-muted-foreground rounded-t-[10px] hover:bg-muted/35 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-card" />}
                  <Icon size={13} className={isActive ? "text-accent-foreground" : "opacity-55"} />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="relative z-1 flex items-center justify-end h-8 pr-1">
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          styles={{ root: { width: 180 }, container: { width: 180, padding: 4 } }}
          content={
            <div className="flex flex-col gap-0.5">
              <button type="button" className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium text-foreground cursor-pointer transition-colors duration-100 bg-transparent border-none font-[inherit] hover:bg-muted" onClick={openMemory}>
                <GraphIcon size={13} className="text-muted-foreground" />
                <span>Memory</span>
              </button>
              <button type="button" className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium text-destructive cursor-pointer transition-colors duration-100 bg-transparent border-none font-[inherit] hover:bg-destructive/10" onClick={confirmDelete}>
                <TrashBinTrashIcon size={13} />
                <span>Delete Agent</span>
              </button>
            </div>
          }
        >
          <button type="button" className="flex items-center justify-center size-7 rounded-md border-none bg-transparent text-muted-foreground cursor-pointer transition-colors duration-150 hover:bg-muted/70 hover:text-foreground" aria-label="Agent menu">
            <MenuDotsIcon size={15} weight="Bold" />
          </button>
        </Popover>
      </div>
    </div>
  );
}
