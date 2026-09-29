import { FluentIcon } from "devnonla-ui";
import type { ReactNode } from "react";
import { cn } from "src/common/lib/cn";

const DEFAULT_WIDTH = 320;

/** Bot toggle for `WindowHeader` right slot — shared by tools, datatables, etc. */
export function AgentToggleButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      aria-label={open ? "Hide agent" : "Show agent"}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 transition-colors", open ? "bg-brand/15 text-brand-700 hover:bg-brand/20" : "bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground")}
    >
      <FluentIcon name="bot-sparkle-24" size={14} />
    </button>
  );
}

/** Right slide-in panel for agent chat — keep mounted while open so stream state survives toggle. */
export function AgentSidePanel({ open, children, width = DEFAULT_WIDTH }: { open: boolean; children: ReactNode; width?: number }) {
  return (
    <div className={cn("flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-border bg-background transition-[width,border-color] duration-200 ease-out", open ? "border-l" : "border-l-0")} style={{ width: open ? width : 0 }} aria-hidden={!open}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ width }}>
        {children}
      </div>
    </div>
  );
}
