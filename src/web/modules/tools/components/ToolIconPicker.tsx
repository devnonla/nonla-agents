import { Button, Input, Popover, Spin } from "@nonla-agents/ui";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import type { ReactNode, UIEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ensureFluentIcons, fluentIconRef, getFluentImgSrc, getIconNames } from "../common/iconify";
import { ToolIcon } from "./ToolIcon";

const PAGE_SIZE = 36;

interface ToolIconPickerProps {
  icon?: string | null;
  onChange: (icon: string | null) => void | Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}

function IconCell({ name, onPick }: { name: string; onPick: () => void }) {
  const src = getFluentImgSrc(name);
  return (
    <button type="button" title={name.replace(/-24$/, "").replace(/-/g, " ")} onClick={onPick} className="flex h-11 w-11 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-white/70">
      {src ? <img src={src} alt="" width={28} height={28} decoding="async" draggable={false} className="size-7 select-none" /> : <span className="size-7 animate-pulse rounded-sm bg-foreground/10" />}
    </button>
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingNames(true);
    setNamesError("");
    void ensureFluentIcons()
      .then((names) => {
        if (!cancelled) setAllNames(names.length ? names : getIconNames());
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
    const q = deferredQuery.trim().toLowerCase().replace(/\s+/g, "-");
    if (!q) return allNames;
    return allNames.filter((n) => n.includes(q));
  }, [allNames, deferredQuery]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const hasMore = visible.length < filtered.length;

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
      await onChange(fluentIconRef(name));
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
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-foreground/10 bg-white/70 text-muted-foreground transition-colors hover:bg-white/90 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      title="Change icon"
      aria-label="Change icon"
    >
      <ToolIcon icon={icon} size={18} />
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        if (saving && next) return;
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
          <Input allowClear size="small" placeholder="Search icons…" value={query} onChange={(e) => setQuery(e.target.value)} prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} autoFocus />
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
                  <IconCell key={name} name={name} onPick={() => void handlePick(name)} />
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
