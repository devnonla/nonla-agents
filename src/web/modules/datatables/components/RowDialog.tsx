import { Empty, Modal, message } from "@nonla-agents/ui";
import { useState } from "react";
import type { DatatableColumn, DatatableRow } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { propertyTypeIcon } from "../common/columnUtils";
import { datatablesApi } from "../common/datatablesApi";
import { cellEditor } from "./CellEditor";

export function RowDialog({
  tableId,
  columns,
  edit,
  timeZone,
  onClose,
  onSaved,
}: {
  tableId: string;
  columns: DatatableColumn[];
  edit?: DatatableRow | null;
  timeZone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(edit?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      if (edit) {
        await datatablesApi.updateRow(edit.id, data);
        message.success("Updated");
      } else {
        await datatablesApi.insertRows(tableId, [data]);
        message.success("Created");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={edit ? "Edit row" : "New row"} onCancel={onClose} onOk={handleSubmit} confirmLoading={saving} okText={edit ? "Save" : "Create"} width={460} styles={{ body: { paddingTop: 12, paddingBottom: 8 } }} destroyOnHidden>
      <div className="flex max-h-[min(56vh,420px)] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {columns.map((col) => (
          <div key={col.id} className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
            <div className="flex min-h-8 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0 text-quaternary-foreground">{propertyTypeIcon(col.type)}</span>
              <span className="min-w-0 truncate font-medium text-foreground/80" title={col.name}>
                {col.name}
              </span>
              {col.required ? <span className="shrink-0 text-destructive">*</span> : null}
            </div>
            <div className="min-w-0">{cellEditor(col, data[col.name], (v) => setData((prev) => ({ ...prev, [col.name]: v })), timeZone)}</div>
          </div>
        ))}
        <RenderIf condition={columns.length === 0}>
          <Empty description="Add a property first" />
        </RenderIf>
        <RenderIf condition={!!error}>
          <p className="mb-0 mt-1 text-sm text-destructive">{error}</p>
        </RenderIf>
      </div>
    </Modal>
  );
}
