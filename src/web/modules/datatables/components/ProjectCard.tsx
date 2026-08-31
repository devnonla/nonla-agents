import { DatabaseIcon } from "@solar-icons/react/dynamic/database";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Dropdown, Tag } from "antd";
import type { MenuProps } from "antd";
import { cn } from "src/common/lib/cn";
import type { DatatableProject } from "src/common/types";
import RenderIf from "src/components/RenderIf";

export type ProjectCardModel = DatatableProject & { tableCount: number; tableNames: string[] };

export function ProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectCardModel;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuItems: MenuProps["items"] = [{ key: "rename", label: "Rename", icon: <PenNewSquareIcon size={14} />, onClick: onRename }, { type: "divider" }, { key: "delete", label: "Delete", danger: true, icon: <TrashBinMinimalisticIcon size={14} />, onClick: onDelete }];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn("group relative flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border-subtle bg-card px-4 py-4 text-left", "transition-[border-color,background-color] duration-200", "hover:border-brand/30 hover:bg-secondary")}
    >
      <div className="relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-muted text-muted-foreground">
        <DatabaseIcon size={20} weight="BoldDuotone" />
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-base font-semibold leading-6 text-foreground">{project.name}</h2>
        <RenderIf condition={project.tableNames.length > 0} fallback={<p className="mt-1.5 mb-0 text-[12px] leading-4 text-muted-foreground">No tables</p>}>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {project.tableNames.map((name) => (
              <Tag key={name} variant="filled" className="m-0! rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-normal leading-none text-muted-foreground">
                {name}
              </Tag>
            ))}
          </div>
        </RenderIf>
      </div>

      <div className="relative z-10 shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
          <Button type="text" size="small" aria-label="Project actions" className="opacity-0 group-hover:opacity-100 focus:opacity-100" icon={<MenuDotsIcon size={16} weight="Bold" />} />
        </Dropdown>
      </div>
    </div>
  );
}
