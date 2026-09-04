import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { apiClient } from "src/common/api";
import type { AgentTool, MyMcpServer, ToolFolder } from "src/common/types";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { toMyMcpServerListItem, updateMyMcpServer, upsertMyMcpServerLocal } from "../common/myMcpServersSlice";
import { CustomToolPicker } from "./CustomToolPicker";

type MyMcpValues = {
  name: string;
  description: string;
  toolIds: string[];
};

export function MyMcpServerDialog({
  edit,
  onClose,
  onCreated,
}: {
  edit?: MyMcpServer | null;
  onClose: () => void;
  onCreated: (server: MyMcpServer) => void;
}) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolder[];
  const isEdit = !!edit;
  const [saving, setSaving] = useState(false);
  const form = useForm<MyMcpValues>({
    defaultValues: {
      name: edit?.name ?? "",
      description: edit?.description ?? "",
      toolIds: edit?.tools?.map((t) => t.id) ?? [],
    },
    mode: "onSubmit",
  });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
  }, [dispatch]);

  useEffect(() => {
    if (!isEdit || !edit?.id) return;
    if (edit.tools) {
      form.setValue(
        "toolIds",
        edit.tools.map((t) => t.id),
      );
      return;
    }
    void apiClient.get<MyMcpServer>(`/api/my-mcp-servers/${edit.id}`).then((detail) => {
      form.setValue("toolIds", detail.tools?.map((t) => t.id) ?? []);
    });
  }, [isEdit, edit, form]);

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Name",
        colSpan: 12,
        rules: {
          required: "Name is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
        },
        options: { placeholder: "my-tools", autoFocus: true },
      },
      {
        type: EFormItemType.Textarea,
        name: "description",
        label: "Description",
        colSpan: 12,
        options: { placeholder: "Optional", rows: 2 },
      },
      {
        type: EFormItemType.Custom,
        name: "toolIds",
        label: "Tools",
        colSpan: 12,
        render: ({ field }) => <CustomToolPicker tools={tools} folders={folders} selectedIds={(field.value as string[]) ?? []} onChange={field.onChange} />,
      },
    ],
    [tools, folders],
  );

  const onSubmit = form.handleSubmit(async ({ name, description, toolIds }) => {
    const trimmedName = name.trim();
    setSaving(true);
    try {
      if (isEdit && edit) {
        const updated = await dispatch(updateMyMcpServer({ id: edit.id, name: trimmedName, description: description.trim() || null, toolIds })).unwrap();
        dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(updated as MyMcpServer)));
        message.success("Updated");
        onClose();
      } else {
        const created = await apiClient.post<MyMcpServer>("/api/my-mcp-servers", {
          name: trimmedName,
          description: description.trim() || null,
          toolIds,
        });
        dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(created)));
        message.success("Created");
        onCreated(created);
        onClose();
      }
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal
      open
      title={isEdit ? "Edit MCP server" : "New MCP server"}
      onCancel={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" form="my-mcp-form" loading={saving}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      }
      destroyOnHidden
      width={520}
    >
      <p className="mb-3 text-sm text-muted-foreground">Pick custom tools to expose. Cursor and Claude Code will see their live schemas.</p>
      <form id="my-mcp-form" onSubmit={onSubmit}>
        <SchemaForm form={form} items={items} />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}
