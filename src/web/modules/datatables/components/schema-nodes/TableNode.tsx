import { DatabaseIcon } from "@solar-icons/react/dynamic/database";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import type { NodeProps } from "@xyflow/react";
import { propertyTypeIcon, propertyTypeLabel } from "../../common/columnUtils";
import type { TableNode } from "./types";

function openTable(e: React.MouseEvent, onClick: () => void) {
  // Body / action buttons: keep RF from treating the press as a node drag.
  e.stopPropagation();
  onClick();
}

export function TableNodeComponent({ data }: NodeProps<TableNode>) {
  return (
    <div className="group min-w-60 max-w-70 overflow-hidden rounded-md border border-border-subtle bg-card text-left shadow-sm transition-all hover:border-border hover:shadow-md">
      <div className="flex items-center gap-0.5 border-b border-border-subtle bg-secondary px-2 py-1.5">
        {/* Drag from database icon or table name (see node.dragHandle). */}
        <div className="table-drag-handle flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-1 py-0.5 active:cursor-grabbing">
          <button
            type="button"
            onClick={(e) => {
              // Still open on a plain click; RF only drags after the move threshold.
              e.stopPropagation();
              data.onClick();
            }}
            className="flex min-w-0 flex-1 cursor-grab items-center gap-2 border-0 bg-transparent p-0 text-left active:cursor-grabbing"
          >
            <DatabaseIcon size={16} weight="BoldDuotone" className="shrink-0 text-brand-soft" />
            <span className="truncate text-sm font-semibold font-mono text-foreground">{data.label}</span>
          </button>
        </div>
        <button
          type="button"
          title="Edit table"
          onClick={(e) => {
            e.stopPropagation();
            data.onEditProperties();
          }}
          className="nodrag nopan inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground opacity-0 transition-all hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
        >
          <PenNewSquareIcon size={14} />
        </button>
      </div>

      <div className="flex flex-col p-0">
        {data.columns.length === 0 ? (
          <button type="button" onClick={(e) => openTable(e, data.onClick)} className="nodrag nopan cursor-pointer border-0 bg-transparent px-3 py-3 text-center text-xs text-muted-foreground">
            No properties
          </button>
        ) : (
          data.columns.map((col, idx) => (
            <button key={col.id} type="button" onClick={(e) => openTable(e, data.onClick)} className={`nodrag nopan flex cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/40 ${idx < data.columns.length - 1 ? "border-b border-border-subtle" : ""}`}>
              <span className="min-w-0 flex-1 truncate text-foreground text-[11px] font-light font-mono">
                {col.name}
                {col.required ? <span className="ml-0.5 text-muted-foreground">*</span> : null}
              </span>
              <span className="shrink-0 text-muted-foreground" title={propertyTypeLabel(col.type)}>
                {propertyTypeIcon(col.type)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
