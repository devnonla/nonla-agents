// ─── Config Tree ──────────────────────────────────────────────────────────────
// Tree-style group + rows (same look as the Tools list page) with a toggle
// switch per leaf. Shared by the Tools and MCP Servers config panels.

import { FluentIcon, Switch } from "devnonla-ui";
import type { ReactNode } from "react";
import { cn } from "src/common/lib/cn";
import { ToolIcon } from "src/modules/tools/components/ToolIcon";

const TREE_STROKE = "text-muted-foreground/40";
const TREE_LINE_FILL = "bg-muted-foreground/40";

function TreeGuide({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("pointer-events-none relative w-8 shrink-0 self-stretch", TREE_STROKE)} aria-hidden>
      {isLast ? (
        <>
          <div className={cn("absolute top-0 left-1/2 w-px -translate-x-1/2", TREE_LINE_FILL, "h-[calc(50%-7px)]")} />
          <svg className="absolute top-[calc(50%-7px)] left-[calc(50%-0.5px)] overflow-visible" width="17" height="8" viewBox="0 0 17 8" fill="none">
            <path d="M0.5 0 V1.5 Q0.5 7.5 8 7.5 H17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </>
      ) : (
        <>
          <div className={cn("absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2", TREE_LINE_FILL)} />
          <div className={cn("absolute top-1/2 left-1/2 h-px w-4 -translate-y-1/2", TREE_LINE_FILL)} />
        </>
      )}
    </div>
  );
}

interface ConfigTreeGroupProps {
  icon: string;
  title: string;
  note?: string;
  allChecked?: boolean;
  onToggleAll?: (checked: boolean) => void;
  children: ReactNode;
}

export function ConfigTreeGroup({ icon, title, note, allChecked, onToggleAll, children }: ConfigTreeGroupProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2.5 py-1.5">
        <div className="flex w-8 shrink-0 items-center justify-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/70 text-foreground/80">
            <FluentIcon name={icon} size={15} />
          </div>
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-foreground">{title}</span>
        {onToggleAll && (
          <button type="button" onClick={() => onToggleAll(!allChecked)} className="shrink-0 cursor-pointer border-none bg-transparent px-1 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            {allChecked ? "Unselect all" : "Select all"}
          </button>
        )}
      </div>

      {note && <div className="pb-1 pl-10.5 text-[11px] leading-snug text-muted-foreground">{note}</div>}

      <div className="relative">
        <div className={cn("absolute top-0 left-4 h-2 w-px -translate-x-1/2", TREE_LINE_FILL)} aria-hidden />
        <div className="flex flex-col gap-0.5 pt-1">{children}</div>
      </div>
    </div>
  );
}

interface ConfigTreeRowProps {
  icon?: string | null;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  isLast: boolean;
}

export function toggleGroupItems(items: { id: string; connected: boolean }[], enable: boolean, onToggle: (id: string, enable: boolean) => void) {
  for (const item of items) {
    if (item.connected !== enable) onToggle(item.id, enable);
  }
}

export function ConfigTreeRow({ icon, label, checked, onToggle, isLast }: ConfigTreeRowProps) {
  return (
    <div className="relative flex items-stretch">
      <TreeGuide isLast={isLast} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/50">
        <ToolIcon icon={icon} size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-snug text-foreground/90">{label}</span>
        <Switch size="small" className="shrink-0" checked={checked} onChange={onToggle} aria-label={`Toggle ${label}`} />
      </div>
    </div>
  );
}
