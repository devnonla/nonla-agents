import { Button, Input, Popover, Spin, Tooltip } from "@nonla-agents/ui";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import type { ReactNode, UIEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchLucideSvg, fetchLucideSvgs, getLucideIconNames } from "../common/iconify";
import { ToolIcon } from "./ToolIcon";

const PAGE_SIZE = 96;

interface ToolIconPickerProps {
  icon?: string | null;
  onChange: (icon: string | null) => void | Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}

function IconCell({ name, svg, onPick }: { name: string; svg?: string; onPick: () => void }) {
  return (
    <Tooltip title={name} mouseEnterDelay={0.25} placement="top">
      <button type="button" onClick={onPick} className="flex h-11 w-11 items-center justify-center rounded-lg border border-transparent text-foreground transition-colors hover:bg-muted hover:text-foreground">
        {svg ? (
          <span
            className="inline-flex size-6 [&>svg]:h-full [&>svg]:w-full"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG markup from Iconify
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="size-4 animate-pulse rounded-sm bg-muted-foreground/20" />
        )}
      </button>
    </Tooltip>
  );
}

export function ToolIconPicker({ icon, onChange, children, disabled }: ToolIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [loadingNames, setLoadingNames] = useState(false);
  const [namesError, setNamesError] = useState("");
  const [allNames, setAllNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [svgMap, setSvgMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingNames(true);
    setNamesError("");
    void getLucideIconNames()
      .then((names) => {
        if (!cancelled) setAllNames(names);
      })
      .catch((err) => {
        if (!cancelled) setNamesError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingNames(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [deferredQuery]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return allNames;
    return allNames.filter((n) => n.includes(q));
  }, [allNames, deferredQuery]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const hasMore = visible.length < filtered.length;

  useEffect(() => {
    if (!open || visible.length === 0) return;
    let cancelled = false;
    void fetchLucideSvgs(visible).then((map) => {
      if (cancelled) return;
      setSvgMap((prev) => {
        const next = { ...prev };
        for (const [name, svg] of map) next[name] = svg;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, visible]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      setLimit((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
    }
  };

  const handlePick = async (name: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const svg = await fetchLucideSvg(name);
      await onChange(svg);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onChange(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const trigger = children ?? (
    <button
      type="button"
      disabled={disabled}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      title="Change icon"
      aria-label="Change icon"
    >
      <ToolIcon icon={icon} size={16} fallback={<ProgrammingIcon size={16} />} />
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled || saving) return;
        setOpen(next);
        if (!next) {
          setQuery("");
          setLimit(PAGE_SIZE);
        }
      }}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      content={
        <div className="flex w-90 flex-col gap-2.5">
          <Input allowClear size="small" placeholder="Search Lucide icons…" value={query} onChange={(e) => setQuery(e.target.value)} prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} autoFocus />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">{loadingNames ? "Loading…" : `${filtered.length.toLocaleString()} icons`}</span>
            <Button type="text" size="small" disabled={!icon || saving} onClick={() => void handleClear()}>
              Clear
            </Button>
          </div>
          <div className="relative h-75 overflow-y-auto rounded-md border border-border/60 bg-card p-2" onScroll={handleScroll}>
            {loadingNames ? (
              <div className="flex h-full items-center justify-center">
                <Spin size="small" />
              </div>
            ) : namesError ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[12px] text-destructive">{namesError}</div>
            ) : visible.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">No icons found</div>
            ) : (
              <div className="grid grid-cols-6 gap-1">
                {visible.map((name) => (
                  <IconCell key={name} name={name} svg={svgMap[name]} onPick={() => void handlePick(name)} />
                ))}
              </div>
            )}
            {saving && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/60">
                <Spin size="small" />
              </div>
            )}
          </div>
        </div>
      }
    >
      {trigger}
    </Popover>
  );
}
