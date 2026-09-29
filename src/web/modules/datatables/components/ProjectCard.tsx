import { Button, Dropdown, FluentIcon } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { Ellipsis, Pencil, X } from "lucide-react";
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
  const menuItems: MenuProps["items"] = [{ key: "rename", label: "Rename", icon: <Pencil size={14} />, onClick: onRename }, { type: "divider" }, { key: "delete", label: "Delete", danger: true, icon: <X size={14} />, onClick: onDelete }];
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
      className="group relative flex h-full cursor-pointer flex-col rounded-xl border border-border-subtle bg-card px-4 py-3.5 text-left hover:border-brand/40"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand-700">
          <FluentIcon name="database-24" size={16} />
        </div>
        <h2 className="m-0 min-w-0 flex-1 truncate pr-6 text-[15px] font-semibold leading-5 text-foreground">{project.name}</h2>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-3">
        <RenderIf condition={project.tableNames.length > 0} fallback={<span className="text-[12px] text-muted-foreground">No tables</span>}>
          <div className="flex max-h-12 flex-wrap gap-1 overflow-hidden">
            {project.tableNames.map((name) => (
              <span key={name} className="max-w-full truncate rounded-md border border-border px-1.5 py-0.5 text-[12px] leading-4 text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        </RenderIf>
      </div>

      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
          <Button type="text" size="small" aria-label="Project actions" className="text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100" icon={<Ellipsis size={16} />} />
        </Dropdown>
      </div>
    </div>
  );
}
