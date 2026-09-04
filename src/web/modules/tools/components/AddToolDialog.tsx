import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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

type AddToolValues = {
  label: string;
  description: string;
  folderId: string;
};

export function AddToolDialog({ onCreated, children, defaultFolderId = null, triggerClassName = "inline-flex w-full" }: AddToolDialogProps) {
  const dispatch = useAppDispatch();
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolderWithTools[];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useForm<AddToolValues>({ defaultValues: { label: "", description: "", folderId: defaultFolderId ?? "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset({ label: "", description: "", folderId: defaultFolderId ?? "" });
    setLoading(false);
    const t = window.setTimeout(() => form.setFocus("label"), 150);
    return () => window.clearTimeout(t);
  }, [open, defaultFolderId, form]);

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "label",
        label: "Tool Name",
        colSpan: 12,
        rules: {
          required: "Please enter a tool name.",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Please enter a tool name."),
        },
        options: { placeholder: "e.g. Get Current Time", autoComplete: "off" },
      },
      {
        type: EFormItemType.Textarea,
        name: "description",
        label: "Description",
        colSpan: 12,
        options: { placeholder: "What does this tool do?", rows: 2 },
      },
      {
        type: EFormItemType.Select,
        name: "folderId",
        label: "Folder",
        colSpan: 12,
        choices: [{ value: "", label: "No folder" }, ...folders.map((f) => ({ value: f.id, label: f.name }))],
        options: { placeholder: "Select folder…" },
      },
    ],
    [folders],
  );

  const handleClose = () => setOpen(false);

  const onSubmit = form.handleSubmit(async ({ label, description, folderId }) => {
    const trimmed = label.trim();
    setLoading(true);
    try {
      const tool = await dispatch(
        createTool({
          name: toSnakeCase(trimmed),
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
      form.setError("root", { message: String(err) });
    } finally {
      setLoading(false);
    }
  });

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
            <Button type="text" size="medium" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="medium" htmlType="submit" form="add-tool-form" loading={loading}>
              {loading ? "Creating…" : "Create & Edit"}
            </Button>
          </div>
        }
      >
        <form id="add-tool-form" className="pt-4" onSubmit={onSubmit}>
          <SchemaForm form={form} items={items} />
          {rootError ? <div className="mt-4 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}
        </form>
      </Modal>
    </>
  );
}
