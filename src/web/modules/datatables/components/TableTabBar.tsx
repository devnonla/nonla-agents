import { Button, Dropdown, FluentIcon } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { Ellipsis, Pencil } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { DatatableTable } from "src/common/types";

const GAP = 6;

function sumWidths(widths: number[], indexes: number[]) {
  return indexes.reduce((sum, index, i) => sum + widths[index]! + (i ? GAP : 0), 0);
}

/** Tabs that fit on one row. The rest go behind "…". The open table stays on the row. */
export function pickVisible(widths: number[], available: number, moreWidth: number, activeIndex: number) {
  const all = widths.map((_, index) => index);
  if (sumWidths(widths, all) <= available) return all;

  const budget = Math.max(0, available - moreWidth - GAP);
  const picked: number[] = [];
  for (let index = 0; index < widths.length; index++) {
    if (sumWidths(widths, [...picked, index]) > budget) break;
    picked.push(index);
  }

  if (activeIndex < 0 || picked.includes(activeIndex)) return picked;

  while (picked.length > 0 && sumWidths(widths, [...picked, activeIndex]) > budget) picked.pop();
  picked.push(activeIndex);
  return picked;
}

function TableChip({ table, active, onSelect, onEdit }: { table: DatatableTable; active: boolean; onSelect: (id: string) => void; onEdit: () => void }) {
  return (
    <Button type={active ? "primary" : "default"} size="default" icon={<FluentIcon name="database-24" size={14} />} onClick={() => onSelect(table.id)} title={table.name} className={cn("group max-w-full shrink-0", active && "pr-1.5!")}>
      <span className="max-w-40 truncate">{table.name}</span>
      {active ? (
        <span
          role="button"
          tabIndex={0}
          title="Edit table"
          aria-label={`Edit ${table.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
        >
          <Pencil size={13} />
        </span>
      ) : null}
    </Button>
  );
}

export function TableTabBar({ tables, selectedId, onSelect, onEdit, addButton }: { tables: DatatableTable[]; selectedId: string | null; onSelect: (id: string) => void; onEdit: () => void; addButton: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>(() => tables.map((_, index) => index));

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;

    const compute = () => {
      const chips = [...measure.querySelectorAll<HTMLElement>("[data-tab]")];
      const more = measure.querySelector<HTMLElement>("[data-more]");
      const widths = chips.map((chip) => chip.offsetWidth);
      const activeIndex = tables.findIndex((table) => table.id === selectedId);
      const next = pickVisible(widths, bar.clientWidth, more?.offsetWidth ?? 32, activeIndex);
      setVisibleIndexes((prev) => (prev.length === next.length && prev.every((value, index) => value === next[index]) ? prev : next));
    };

    const observer = new ResizeObserver(compute);
    observer.observe(bar);
    compute();
    return () => observer.disconnect();
  }, [tables, selectedId]);

  const visible = new Set(visibleIndexes);
  const overflow = tables.filter((_, index) => !visible.has(index));
  const menuItems: MenuProps["items"] = overflow.map((table) => ({
    key: table.id,
    label: table.name,
    icon: <FluentIcon name="database-24" size={14} />,
    onClick: () => {
      setMoreOpen(false);
      onSelect(table.id);
    },
  }));

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle px-3 py-2">
      <div ref={barRef} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {tables.map((table, index) => (visible.has(index) ? <TableChip key={table.id} table={table} active={table.id === selectedId} onSelect={onSelect} onEdit={onEdit} /> : null))}
        {overflow.length > 0 ? (
          <Dropdown trigger={["click"]} placement="bottomLeft" open={moreOpen} onOpenChange={setMoreOpen} menu={{ items: menuItems, style: { minWidth: 180, maxHeight: 320, overflow: "auto" } }}>
            <Button size="default" icon={<Ellipsis size={14} />} aria-label={`${overflow.length} more tables`} title={`${overflow.length} more tables`} className="shrink-0" />
          </Dropdown>
        ) : null}
      </div>

      {addButton}

      <div ref={measureRef} className="pointer-events-none invisible fixed top-0 -left-2499.75 flex items-center gap-1.5" aria-hidden>
        {tables.map((table) => (
          <span key={table.id} data-tab className="group">
            <TableChip table={table} active={table.id === selectedId} onSelect={onSelect} onEdit={onEdit} />
          </span>
        ))}
        <span data-more>
          <Button size="default" icon={<Ellipsis size={14} />} tabIndex={-1} />
        </span>
      </div>
    </div>
  );
}
