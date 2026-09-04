import type { MenuProps } from "@nonla-agents/ui";
import { Dropdown, Modal } from "@nonla-agents/ui";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "src/common/lib/cn";
import { ToolIconPicker } from "../../components/ToolIconPicker";

/** Same raised fill as NonlaUI Button default. */
const TRACK_RAISED = "shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.07),0_1px_2px_rgb(0_0_0_/_0.28),0_1px_1px_rgb(0_0_0_/_0.18)]";
const THUMB_RAISED = "shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.14),0_1px_2px_rgb(0_0_0_/_0.35),0_1px_1px_rgb(0_0_0_/_0.2)]";

interface EditToolHeaderProps {
  label: string;
  toolId?: string;
  icon?: string | null;
  isActive: boolean;
  toggling: boolean;
  deleting: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
  onIconChange: (icon: string | null) => void | Promise<void>;
}

export function EditToolHeader({ label, toolId, icon, isActive, toggling, deleting, onToggleActive, onDelete, onIconChange }: EditToolHeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDeleteClick = () => {
    setMenuOpen(false);
    Modal.confirm({
      title: `Delete "${label || toolId}"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: onDelete,
    });
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      danger: true,
      disabled: deleting,
      label: (
        <div className="flex items-center gap-2">
          <TrashBinTrashIcon size={14} />
          Delete
        </div>
      ),
      onClick: handleDeleteClick,
    },
  ];

  return (
    <div className="shrink-0 flex items-center gap-3 h-12 px-4 border-b border-border bg-card">
      <button type="button" onClick={() => navigate("/tools")} className="flex items-center justify-center size-8 rounded-md bg-transparent border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0" title="Back to Tools">
        <AltArrowLeftIcon size={16} />
      </button>

      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <ToolIconPicker icon={icon} onChange={onIconChange} />
        <h1 className="text-base font-semibold text-foreground truncate m-0 leading-5">{label}</h1>
      </div>

      <button
        type="button"
        role="switch"
        disabled={toggling}
        aria-checked={isActive}
        aria-label={isActive ? "Deactivate tool" : "Activate tool"}
        onClick={onToggleActive}
        className={cn(
          "relative isolate h-7 w-17 shrink-0 rounded-md border border-transparent transition-[background-color,box-shadow] duration-150",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
          "after:pointer-events-none after:absolute after:inset-0 after:z-0 after:rounded-[inherit] after:bg-[linear-gradient(rgb(255_255_255/0.11),transparent)]",
          isActive ? cn("bg-[color-mix(in_oklab,var(--success)_28%,var(--secondary))] text-success", "hover:bg-[color-mix(in_oklab,var(--success)_36%,var(--secondary))]", TRACK_RAISED) : cn("bg-secondary text-foreground", "hover:bg-[color-mix(in_oklab,var(--secondary),white_8%)]", TRACK_RAISED),
        )}
      >
        <span className={cn("pointer-events-none absolute inset-y-0 z-0 flex items-center text-[10px] font-semibold leading-none tracking-wide", isActive ? "left-2.5 text-success" : "right-2 text-muted-foreground")}>{isActive ? "ON" : "OFF"}</span>
        <span aria-hidden className={cn("pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 z-1 aspect-square rounded-[5px] bg-[#ebebeb] transition-transform duration-150 ease-out", THUMB_RAISED, isActive && "translate-x-10")} />
      </button>

      <Dropdown trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems, style: { minWidth: 160 } }}>
        <button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer" aria-label="Tool menu">
          <MenuDotsIcon size={15} weight="Bold" />
        </button>
      </Dropdown>
    </div>
  );
}
