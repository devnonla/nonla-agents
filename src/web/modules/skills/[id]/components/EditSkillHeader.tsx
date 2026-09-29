import { FluentIcon, Popover, WindowHeader } from "devnonla-ui";
import { Check, Ellipsis, X } from "lucide-react";
import { useState } from "react";
import { cn } from "src/common/lib/cn";
import { AgentToggleButton } from "src/components/AgentSidePanel";
import { WindowHeaderBackButton } from "src/components/WindowHeaderBackButton";

export type SkillViewMode = "preview" | "editor";

interface EditSkillHeaderProps {
  title: string;
  viewMode: SkillViewMode;
  onViewModeChange: (mode: SkillViewMode) => void;
  onDelete: () => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
}

const VIEW_OPTIONS: { value: SkillViewMode; label: string; icon: string }[] = [
  { value: "preview", label: "Preview", icon: "search-visual-24" },
  { value: "editor", label: "Editor", icon: "code-24" },
];

export function EditSkillHeader({ title, viewMode, onViewModeChange, onDelete, agentOpen, onToggleAgent }: EditSkillHeaderProps) {
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
    <WindowHeader
      left={
        <div className="flex min-w-0 items-center gap-2">
          <WindowHeaderBackButton to="/skills" label="Back to skills" />
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-foreground/90">{title}</span>
        </div>
      }
      right={
        <div className="flex items-center gap-1.5">
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
                    const active = viewMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleViewChange(opt.value)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-2.5 py-2 text-left font-[inherit] text-[13px] font-medium transition-colors duration-100",
                          active ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        )}
                      >
                        <FluentIcon name={opt.icon} size={16} className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1">{opt.label}</span>
                        {active ? <Check size={14} className="shrink-0 text-brand-700" /> : <span className="size-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mx-1 my-1.5 h-px bg-border" />
                <button type="button" onClick={handleDelete} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-2 text-left font-[inherit] text-[13px] font-medium text-destructive transition-colors duration-100 hover:bg-destructive/10">
                  <X size={16} className="shrink-0" />
                  <span>Delete skill</span>
                </button>
              </div>
            }
          >
            <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground" aria-label="Skill menu">
              <Ellipsis size={14} />
            </button>
          </Popover>
          <AgentToggleButton open={agentOpen} onClick={onToggleAgent} />
        </div>
      }
    />
  );
}
