import { Button, Popover } from "@nonla-agents/ui";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { CheckCircleIcon } from "@solar-icons/react/dynamic/check-circle";
import { CodeSquareIcon } from "@solar-icons/react/dynamic/code-square";
import { EyeIcon } from "@solar-icons/react/dynamic/eye";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "src/common/lib/cn";
import RenderIf from "src/components/RenderIf";

export type SkillViewMode = "preview" | "editor";

interface EditSkillHeaderProps {
  title: string;
  hasDraft: boolean;
  viewMode: SkillViewMode;
  onViewModeChange: (mode: SkillViewMode) => void;
  onDelete: () => void;
}

const VIEW_OPTIONS: { value: SkillViewMode; label: string; icon: typeof EyeIcon }[] = [
  { value: "preview", label: "Preview", icon: EyeIcon },
  { value: "editor", label: "Editor", icon: CodeSquareIcon },
];

export function EditSkillHeader({ title, hasDraft, viewMode, onViewModeChange, onDelete }: EditSkillHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleViewChange = (mode: SkillViewMode) => {
    setMenuOpen(false);
    onViewModeChange(mode);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    onDelete();
  };

  return (
    <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <Link to="/skills" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to skills">
        <AltArrowLeftIcon size={18} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="m-0 truncate text-sm font-semibold">{title}</h1>
          <RenderIf condition={hasDraft}>
            <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-soft">Draft changes</span>
          </RenderIf>
        </div>
      </div>
      <Popover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger="click"
        placement="bottomRight"
        arrow={false}
        styles={{ root: { width: 240 }, container: { width: 240, padding: 6 } }}
        content={
          <div className="flex flex-col">
            <p className="m-0 px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">View</p>
            <div className="flex flex-col gap-0.5">
              {VIEW_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = viewMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleViewChange(opt.value)}
                    className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-2.5 py-2 text-left font-[inherit] text-[13px] font-medium transition-colors duration-100", active ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
                  >
                    <Icon size={16} className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">{opt.label}</span>
                    {active ? <CheckCircleIcon size={14} className="shrink-0 text-brand-soft" /> : <span className="size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="mx-1 my-1.5 h-px bg-border" />
            <button type="button" onClick={handleDelete} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-2 text-left font-[inherit] text-[13px] font-medium text-destructive transition-colors duration-100 hover:bg-destructive/10">
              <TrashBinTrashIcon size={16} className="shrink-0" />
              <span>Delete skill</span>
            </button>
          </div>
        }
      >
        <Button type="text" size="small" icon={<MenuDotsIcon size={16} weight="Bold" />} aria-label="Skill menu" />
      </Popover>
    </header>
  );
}
