import { cn } from "src/common/lib/cn";
import type { DatatableColumn } from "src/common/types";
import { formatTimezoneTooltip } from "src/common/utils/date";
import { propertyTypeIcon } from "../common/columnUtils";

export function PropertyHeader({ col, timeZone }: { col: DatatableColumn; timeZone: string }) {
  const headerTitle = col.type === "datetime" ? formatTimezoneTooltip(timeZone) : undefined;

  return (
    <div title={headerTitle} className={cn("flex h-full w-full min-w-0 items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground", col.type === "boolean" ? "justify-center text-center" : "text-left")}>
      <span className="shrink-0 text-quaternary-foreground">{propertyTypeIcon(col.type)}</span>
      <span className="min-w-0 truncate">{col.name}</span>
    </div>
  );
}
