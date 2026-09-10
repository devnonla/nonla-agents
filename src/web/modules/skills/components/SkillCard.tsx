import { Button, Dropdown } from "@nonla-agents/ui";
import type { MenuProps } from "@nonla-agents/ui";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { StarsIcon } from "@solar-icons/react/dynamic/stars";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { useMemo, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { Skill } from "src/common/types";
import RenderIf from "src/components/RenderIf";

function hasPendingDraft(skill: Skill): boolean {
  const draft = skill.draftContent;
  if (draft == null || draft === "") return false;
  return draft !== skill.content;
}

export function SkillCard({
  skill,
  onOpen,
  onDelete,
}: {
  skill: Skill;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const draft = hasPendingDraft(skill);

  const menuItems: MenuProps["items"] = useMemo(() => [{ key: "delete", label: "Delete", danger: true, icon: <TrashBinMinimalisticIcon size={14} />, onClick: onDelete }], [onDelete]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${skill.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn("group relative flex h-full cursor-pointer gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-left", "transition-[border-color,background-color] duration-200", "hover:border-edge-skill/35 hover:bg-secondary")}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-edge-skill/12 text-edge-skill">
        <StarsIcon size={18} weight="BoldDuotone" />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <div className="flex items-center gap-2">
          <h2 className="m-0 truncate text-[15px] font-semibold leading-5 text-foreground">{skill.name}</h2>
          <RenderIf condition={draft}>
            <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-soft">Draft</span>
          </RenderIf>
        </div>
        <p className="mt-1 mb-0 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{skill.description || "No description"}</p>
      </div>
      <div className="absolute right-1.5 top-1.5 z-10" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen}>
          <Button type="text" size="small" aria-label={`${skill.name} actions`} className={cn("text-muted-foreground hover:text-foreground", menuOpen && "bg-muted text-foreground")} icon={<MenuDotsIcon size={16} weight="Bold" />} />
        </Dropdown>
      </div>
    </div>
  );
}
