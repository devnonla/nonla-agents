import { Dropdown, FluentIcon, type MenuProps, Segmented, WindowHeader } from "devnonla-ui";
import { Ellipsis, Pencil, X } from "lucide-react";
import { AgentToggleButton } from "src/components/AgentSidePanel";
import RenderIf from "src/components/RenderIf";
import { WindowHeaderBackButton } from "src/components/WindowHeaderBackButton";

export type SiteViewMode = "preview" | "editor";

interface SiteEditorHeaderProps {
  title: string;
  draftDirty?: boolean;
  viewMode: SiteViewMode;
  onViewModeChange: (mode: SiteViewMode) => void;
  onEditName: () => void;
  onDelete: () => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
}

function SiteViewToggle({ value, onChange }: { value: SiteViewMode; onChange: (v: SiteViewMode) => void }) {
  return (
    <Segmented
      size="small"
      value={value}
      onChange={onChange}
      options={[
        {
          value: "preview",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <FluentIcon name="search-visual-24" size={14} />
              Preview
            </span>
          ),
        },
        {
          value: "editor",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <FluentIcon name="code-24" size={14} />
              Editor
            </span>
          ),
        },
      ]}
    />
  );
}

export function SiteEditorHeader({ title, draftDirty, viewMode, onViewModeChange, onEditName, onDelete, agentOpen, onToggleAgent }: SiteEditorHeaderProps) {
  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: "Edit name",
      icon: <Pencil size={14} />,
      onClick: onEditName,
    },
    { type: "divider" },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      icon: <X size={14} />,
      onClick: onDelete,
    },
  ];

  return (
    <WindowHeader
      left={
        <div className="flex min-w-0 items-center gap-2">
          <WindowHeaderBackButton to="/sites" label="Back to sites" />
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-foreground/90">{title}</span>
          <RenderIf condition={!!draftDirty}>
            <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-700">Draft changes</span>
          </RenderIf>
        </div>
      }
      right={
        <div className="flex items-center gap-1.5">
          <SiteViewToggle value={viewMode} onChange={onViewModeChange} />
          <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
            <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground" aria-label="Site menu">
              <Ellipsis size={14} />
            </button>
          </Dropdown>
          <AgentToggleButton open={agentOpen} onClick={onToggleAgent} />
        </div>
      }
    />
  );
}
