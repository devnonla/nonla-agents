import { Button, Dropdown, FluentIcon } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { Ellipsis, X } from "lucide-react";
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

  const menuItems: MenuProps["items"] = useMemo(() => [{ key: "delete", label: "Delete", danger: true, icon: <X size={14} />, onClick: onDelete }], [onDelete]);

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
      className={cn("group relative flex h-full cursor-pointer gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-left", "transition-[border-color,background-color] duration-200", "hover:border-warn/35 hover:bg-secondary")}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warn/12 text-warn">
        <FluentIcon name="star-24" size={18} />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <div className="flex items-center gap-2">
          <h2 className="m-0 truncate text-[15px] font-semibold leading-5 text-foreground">{skill.name}</h2>
          <RenderIf condition={draft}>
            <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-700">Draft</span>
          </RenderIf>
        </div>
        <p className="mt-1 mb-0 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{skill.description || "No description"}</p>
      </div>
      <div className="absolute right-1.5 top-1.5 z-10" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen}>
          <Button type="text" size="small" aria-label={`${skill.name} actions`} className={cn("text-muted-foreground hover:text-foreground", menuOpen && "bg-muted text-foreground")} icon={<Ellipsis size={16} />} />
        </Dropdown>
      </div>
    </div>
  );
}
