import { Checkbox, Input, Switch } from "@nonla-agents/ui";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { type ReactNode, useMemo, useState } from "react";

function toggleIds(current: string[], ids: string[], checked: boolean): string[] {
  const next = new Set(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

export function UnrestrictedToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">Unrestricted</div>
        <div className="text-[11px] text-muted-foreground">No limit — including items created later</div>
      </div>
      <Switch size="small" checked={checked} onChange={onChange} />
    </div>
  );
}

export function ScopePicker<T>({
  unrestricted,
  onUnrestrictedChange,
  items,
  selectedIds,
  onChange,
  getId,
  getLabel,
  searchPlaceholder,
  emptyText,
  unrestrictedHint,
  renderItem,
}: {
  unrestricted: boolean;
  onUnrestrictedChange: (value: boolean) => void;
  items: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  searchPlaceholder: string;
  emptyText: string;
  unrestrictedHint: string;
  renderItem?: (item: T) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => getLabel(item).toLowerCase().includes(q));
  }, [items, query, getLabel]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = visible.map(getId);
  const checkedCount = visibleIds.filter((id) => selected.has(id)).length;
  const allChecked = visibleIds.length > 0 && checkedCount === visibleIds.length;
  const someChecked = checkedCount > 0 && !allChecked;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <UnrestrictedToggle checked={unrestricted} onChange={onUnrestrictedChange} />
      {unrestricted ? (
        <p className="m-0 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">{unrestrictedHint}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} allowClear prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} />
            <span className="shrink-0 text-[11px] tabular-nums text-tertiary-foreground">{selectedIds.length} selected</span>
          </div>
          <div className="max-h-55 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="m-0 px-3 py-8 text-center text-sm text-muted-foreground">{items.length === 0 ? emptyText : "No matches"}</p>
            ) : (
              <>
                <div className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40" onClick={() => onChange(toggleIds(selectedIds, visibleIds, !allChecked))}>
                  <Checkbox checked={allChecked} indeterminate={someChecked} onClick={(e) => e.stopPropagation()} onChange={(checked) => onChange(toggleIds(selectedIds, visibleIds, checked))} />
                  <span className="text-[12px] text-muted-foreground">Select all</span>
                </div>
                {visible.map((item) => {
                  const id = getId(item);
                  const checked = selected.has(id);
                  return (
                    <div key={id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/40" onClick={() => onChange(toggleIds(selectedIds, [id], !checked))}>
                      <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(checked) => onChange(toggleIds(selectedIds, [id], checked))} />
                      {renderItem ? renderItem(item) : <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{getLabel(item)}</span>}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
