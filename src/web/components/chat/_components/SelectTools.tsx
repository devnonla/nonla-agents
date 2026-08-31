import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { Popover } from "antd";
import { useState } from "react";
import { cn } from "src/common/lib/cn";
import RenderIf from "src/components/RenderIf";

export type ChatToolItem = {
  id: string;
  label: string;
  description?: string;
};

interface SelectToolsProps {
  tools: ChatToolItem[];
  loading?: boolean;
}

export function SelectTools({ tools, loading = false }: SelectToolsProps) {
  const [open, setOpen] = useState(false);
  const count = tools.length;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      arrow={false}
      styles={{
        root: { filter: "none" },
        container: {
          padding: 0,
          border: "none",
          boxShadow: "none",
          background: "transparent",
        },
      }}
      content={
        <div className="box-border w-72 max-h-80 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <ProgrammingIcon size={13} className="shrink-0 text-muted-foreground" />
            <span className="text-[12px] font-medium text-foreground">Tools</span>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{loading ? "…" : count}</span>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            <RenderIf condition={loading}>
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground animate-pulse">Loading…</div>
            </RenderIf>

            <RenderIf condition={!loading && count === 0}>
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">No tools assigned</div>
            </RenderIf>

            <RenderIf condition={!loading && count > 0}>
              {tools.map((tool) => (
                <div key={tool.id} className="flex items-start gap-2 px-3 py-1.5">
                  <ProgrammingIcon size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium leading-snug text-foreground">{tool.label}</div>
                    <RenderIf condition={!!tool.description}>
                      <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{tool.description}</div>
                    </RenderIf>
                  </div>
                </div>
              ))}
            </RenderIf>
          </div>
        </div>
      }
    >
      <button type="button" className={cn("flex h-5.5 items-center gap-1.5 rounded-full px-1.5 font-normal leading-none transition-all duration-150 cursor-pointer outline-none", open ? "bg-border/70 text-foreground" : "text-foreground/90 hover:bg-border/60")} title="View tools" aria-label="View tools">
        <ProgrammingIcon size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-[12px] font-normal leading-none">Tools{!loading && count > 0 ? ` · ${count}` : ""}</span>
        <AltArrowDownIcon size={9} className={cn("shrink-0 transition-transform duration-150", open ? "rotate-180 text-foreground" : "text-border-hover")} />
      </button>
    </Popover>
  );
}
