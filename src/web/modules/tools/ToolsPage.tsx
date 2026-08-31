// ─── Tools Page ──────────────────────────────────────────────────────────────
// Route: /tools — Custom tools organized by folder.

import { AddIcon } from "@solar-icons/react/dynamic/add";
import { FolderIcon } from "@solar-icons/react/dynamic/folder";
import { message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentTool } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import { RawButton } from "src/components/RawButton";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteToolFolder, fetchToolFolders } from "./common/toolFoldersSlice";
import type { ToolFolderWithTools } from "./common/toolFoldersSlice";
import { fetchTools } from "./common/toolsSlice";
import { AddToolDialog } from "./components/AddToolDialog";
import { FolderDialog } from "./components/FolderDialog";
import { ToolsTreeView } from "./components/ToolsTreeView";

export default function ToolsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolderWithTools[];

  const [editingFolder, setEditingFolder] = useState<ToolFolderWithTools | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
  }, [dispatch]);

  const customTools = useMemo(() => tools.filter((t) => !t.id.startsWith("builtin:")), [tools]);

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

  return (
    <>
      <PageShell>
        <MissingProviderCallout />
        <div className="mb-8 flex items-center justify-between">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Tools</h1>
          <div className="flex items-center gap-2">
            <RawButton type="default" icon={<FolderIcon size={16} />} onClick={() => setCreatingFolder(true)}>
              New Folder
            </RawButton>
            <AddToolDialog onCreated={handleToolClick}>
              <RawButton type="primary" icon={<AddIcon size={16} />}>
                New Tool
              </RawButton>
            </AddToolDialog>
          </div>
        </div>

        <ToolsTreeView tools={customTools} folders={folders} onToolClick={handleToolClick} onToolCreated={handleToolClick} onEditFolder={setEditingFolder} onDeleteFolder={handleDeleteFolder} onCreateFolder={() => setCreatingFolder(true)} />
      </PageShell>

      <FolderDialog
        open={!!editingFolder || creatingFolder}
        onClose={() => {
          setEditingFolder(null);
          setCreatingFolder(false);
        }}
        folder={editingFolder}
      />
    </>
  );
}
