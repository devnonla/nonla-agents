import { AddIcon } from "@solar-icons/react/dynamic/add";
import { Button, Form, Input, Modal, Select } from "antd";
import type { InputRef } from "antd";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import type { ToolFolderWithTools } from "src/modules/tools/common/toolFoldersSlice";
import { createTool, fetchTools } from "src/modules/tools/common/toolsSlice";
import { toSnakeCase } from "src/modules/tools/common/utils";
import { useAppDispatch, useAppSelector } from "src/store/store";

interface AddToolDialogProps {
  onCreated: (toolId: string) => void;
  children: ReactNode;
  defaultFolderId?: string | null;
  triggerClassName?: string;
}

export function AddToolDialog({ onCreated, children, defaultFolderId = null, triggerClassName = "inline-flex w-full" }: AddToolDialogProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<InputRef>(null);
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolderWithTools[];

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setDescription("");
      setFolderId(defaultFolderId ?? "");
      setError("");
      setLoading(false);
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [open, defaultFolderId]);

  const handleClose = () => setOpen(false);

  const handleSubmit = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Please enter a tool name.");
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const name = toSnakeCase(trimmed);
      const tool = await dispatch(
        createTool({
          name,
          label: trimmed,
          description: description.trim(),
          parameters: { type: "object", properties: {}, required: [] },
          codeContent: "",
          isActive: false,
          folderId: folderId || null,
        }),
      ).unwrap();
      await dispatch(fetchTools());
      await dispatch(fetchToolFolders());
      handleClose();
      onCreated(tool.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const folderOptions = [{ value: "", label: "No folder" }, ...folders.map((f) => ({ value: f.id, label: f.name }))];

  return (
    <>
      <span className={triggerClassName} onClick={() => setOpen(true)}>
        {children}
      </span>

      <Modal
        open={open}
        onCancel={handleClose}
        title={
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
              <div className="text-[14px] leading-none text-muted-foreground">
                <AddIcon size={16} />
              </div>
            </div>
            <span className="truncate font-semibold text-foreground">New Tool</span>
          </div>
        }
        width={420}
        centered
        destroyOnHidden
        footer={
          <div className="flex justify-end gap-2.5">
            <Button type="text" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={loading} onClick={handleSubmit} disabled={!label.trim()}>
              {loading ? "Creating…" : "Create & Edit"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-4">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Tool Name<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input
              ref={inputRef}
              id="new-tool-label"
              placeholder="e.g. Get Current Time"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label={<span className="text-muted-foreground">Description</span>} className="mb-0!" layout="vertical">
            <Input.TextArea id="new-tool-description" placeholder="What does this tool do?" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="min-h-0!" />
          </Form.Item>
          <Form.Item label={<span className="text-muted-foreground">Folder</span>} className="mb-0!" layout="vertical">
            <Select value={folderId} onChange={setFolderId} options={folderOptions} placeholder="Select folder…" className="w-full" />
          </Form.Item>
          {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
        </div>
      </Modal>
    </>
  );
}
