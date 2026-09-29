// ─── Tools Page ──────────────────────────────────────────────────────────────
// Route: /tools — Custom tools + connected MCP servers, organized like folders.

import { Button, Dropdown, FluentIcon, Modal, message } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { Check, ListFilter, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import type { AgentTool, McpServer } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import { deleteMcpServer, fetchMcpServers, upsertMcpServerLocal } from "src/modules/mcp-servers/common/mcpServersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteToolFolder, fetchToolFolders } from "./common/toolFoldersSlice";
import type { ToolFolderWithTools } from "./common/toolFoldersSlice";
import { fetchTools } from "./common/toolsSlice";
import { AddToolDialog } from "./components/AddToolDialog";
import { FolderDialog } from "./components/FolderDialog";
import { McpConnectDialog } from "./components/McpConnectDialog";
import { ToolsTreeView } from "./components/ToolsTreeView";

type ToolsFilter = { kind: "all" } | { kind: "folder"; folderId: string | null; label: string } | { kind: "mcp"; serverId: string; label: string };

const UNGROUPED_FILTER_ID = null;

function filterLabel(label: string, active: boolean) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check size={14} className="shrink-0 text-brand-700" /> : <span className="size-3.5 shrink-0" />}
    </span>
  );
}

function ToolsFilterDropdown({
  value,
  folders,
  mcpServers,
  onChange,
}: {
  value: ToolsFilter;
  folders: ToolFolderWithTools[];
  mcpServers: McpServer[];
  onChange: (value: ToolsFilter) => void;
}) {
  const [open, setOpen] = useState(false);

  const sortedFolders = useMemo(
    () =>
      [...folders].sort((a, b) => {
        const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (byOrder !== 0) return byOrder;
        return a.name.localeCompare(b.name);
      }),
    [folders],
  );

  const sortedServers = useMemo(() => [...mcpServers].sort((a, b) => a.name.localeCompare(b.name)), [mcpServers]);

  const currentLabel = value.kind === "all" ? "All" : value.label;

  const isFolderActive = (folderId: string | null) => value.kind === "folder" && value.folderId === folderId;
  const isMcpActive = (serverId: string) => value.kind === "mcp" && value.serverId === serverId;

  const items: MenuProps["items"] = [
    {
      key: "all",
      label: filterLabel("All", value.kind === "all"),
      onClick: () => onChange({ kind: "all" }),
    },
    {
      type: "group",
      key: "custom-tools",
      label: "Custom Tools",
      children: [
        ...sortedFolders.map((folder) => ({
          key: `folder:${folder.id}`,
          icon: <FluentIcon name="toolbox-24" size={15} />,
          label: filterLabel(folder.name, isFolderActive(folder.id)),
          onClick: () => onChange({ kind: "folder", folderId: folder.id, label: folder.name }),
        })),
        {
          key: "folder:ungrouped",
          icon: <FluentIcon name="toolbox-24" size={15} className="opacity-70" />,
          label: filterLabel("Ungrouped", isFolderActive(UNGROUPED_FILTER_ID)),
          onClick: () => onChange({ kind: "folder", folderId: UNGROUPED_FILTER_ID, label: "Ungrouped" }),
        },
      ],
    },
    {
      type: "group",
      key: "mcp-servers",
      label: "MCP Servers",
      children:
        sortedServers.length === 0
          ? [{ key: "mcp-empty", label: "No servers connected", disabled: true }]
          : sortedServers.map((server) => ({
              key: `mcp:${server.id}`,
              icon: <FluentIcon name="globe-shield-24" size={15} />,
              label: filterLabel(server.name, isMcpActive(server.id)),
              onClick: () => onChange({ kind: "mcp", serverId: server.id, label: server.name }),
            })),
    },
  ];

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" open={open} onOpenChange={setOpen} menu={{ items, style: { minWidth: 240 } }}>
      <Button type="default" icon={<ListFilter size={16} />} className="hover:bg-white/75">
        {currentLabel}
      </Button>
    </Dropdown>
  );
}

export default function ToolsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolderWithTools[];
  const mcpServers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const [editingFolder, setEditingFolder] = useState<ToolFolderWithTools | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [connectMcpOpen, setConnectMcpOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [toolsFilter, setToolsFilter] = useState<ToolsFilter>({ kind: "all" });

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
    dispatch(fetchMcpServers());
  }, [dispatch]);

  const customTools = useMemo(() => tools.filter((t) => !t.id.startsWith("builtin:")), [tools]);

  const showCustomTools = toolsFilter.kind === "all" || toolsFilter.kind === "folder";
  const showMcpServers = toolsFilter.kind === "all" || toolsFilter.kind === "mcp";

  const filteredFolders = useMemo(() => {
    if (toolsFilter.kind === "folder") {
      if (toolsFilter.folderId == null) return [];
      return folders.filter((folder) => folder.id === toolsFilter.folderId);
    }
    return folders;
  }, [folders, toolsFilter]);

  const filteredTools = useMemo(() => {
    if (toolsFilter.kind !== "folder") return customTools;
    if (toolsFilter.folderId == null) return customTools.filter((tool) => !tool.folderId);
    return customTools.filter((tool) => tool.folderId === toolsFilter.folderId);
  }, [customTools, toolsFilter]);

  const filteredMcpServers = useMemo(() => {
    if (toolsFilter.kind === "mcp") return mcpServers.filter((server) => server.id === toolsFilter.serverId);
    return mcpServers;
  }, [mcpServers, toolsFilter]);

  const handleToolClick = (toolId: string) => {
    navigate(`/tools/${toolId}`);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await dispatch(deleteToolFolder(folderId)).unwrap();
      message.success("Folder deleted");
      await dispatch(fetchTools());
    } catch {
      message.error("Failed to delete folder");
    }
  };

  const handleSyncMcp = async (serverId: string) => {
    try {
      await apiClient.post(`/api/mcp-servers/${serverId}/sync`);
      await dispatch(fetchMcpServers());
      message.success("Synced");
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      await dispatch(fetchMcpServers());
    }
  };

  const handleDeleteMcp = async (serverId: string) => {
    try {
      await dispatch(deleteMcpServer(serverId)).unwrap();
      message.success("Disconnected");
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const fabItems: MenuProps["items"] = [
    {
      key: "folder",
      label: (
        <div className="flex items-center gap-2">
          <FluentIcon name="toolbox-24" size={15} />
          New folder
        </div>
      ),
      onClick: () => setCreatingFolder(true),
    },
    {
      key: "tool",
      label: (
        <div className="flex items-center gap-2">
          <FluentIcon name="code-block-24" size={15} />
          New tool
        </div>
      ),
      onClick: () => setAddToolOpen(true),
    },
    {
      key: "mcp",
      label: (
        <div className="flex items-center gap-2">
          <FluentIcon name="globe-shield-24" size={15} />
          Connect MCP server
        </div>
      ),
      onClick: () => setConnectMcpOpen(true),
    },
  ];

  return (
    <>
      <PageShell className="pb-24 in-data-expanded:pb-24">
        <MissingProviderCallout />
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Tools</h1>
            <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Custom JS tools and connected MCP servers in one place.</p>
          </div>
          <ToolsFilterDropdown value={toolsFilter} folders={folders} mcpServers={mcpServers} onChange={setToolsFilter} />
        </div>

        <ToolsTreeView
          tools={filteredTools}
          folders={filteredFolders}
          mcpServers={filteredMcpServers}
          showCustomTools={showCustomTools}
          showMcpServers={showMcpServers}
          onToolClick={handleToolClick}
          onToolCreated={handleToolClick}
          onEditFolder={setEditingFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateFolder={() => setCreatingFolder(true)}
          onManageMcpServer={(server) => navigate(`/tools/mcp/${server.id}`)}
          onSyncMcpServer={(id) => void handleSyncMcp(id)}
          onDeleteMcpServer={(id) => {
            Modal.confirm({
              title: "Disconnect MCP server?",
              content: "Agents using tools from this server will lose those assignments.",
              okText: "Disconnect",
              okButtonProps: { danger: true },
              cancelText: "Cancel",
              onOk: () => handleDeleteMcp(id),
            });
          }}
        />
      </PageShell>

      <Dropdown trigger={["click"]} placement="topRight" open={fabOpen} onOpenChange={setFabOpen} menu={{ items: fabItems, style: { minWidth: 200 } }}>
        <Button type="primary" shape="circle" icon={<Plus strokeWidth={2.75} />} styles={{ icon: { width: 18, height: 18 } }} aria-label="Add" className="fixed right-6 bottom-6 z-40 flex! h-10! w-10! items-center justify-center shadow-lg" />
      </Dropdown>

      <AddToolDialog open={addToolOpen} onOpenChange={setAddToolOpen} onCreated={handleToolClick} />

      <FolderDialog
        open={!!editingFolder || creatingFolder}
        onClose={() => {
          setEditingFolder(null);
          setCreatingFolder(false);
        }}
        folder={editingFolder}
      />

      <McpConnectDialog
        open={connectMcpOpen}
        onClose={() => setConnectMcpOpen(false)}
        onSaved={(server) => {
          dispatch(upsertMcpServerLocal(server));
          setConnectMcpOpen(false);
          void dispatch(fetchMcpServers());
          navigate(`/tools/mcp/${server.id}`);
        }}
      />
    </>
  );
}
