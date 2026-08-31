import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { RestartIcon } from "@solar-icons/react/dynamic/restart";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Input, Modal, Popconfirm, Select, Switch, message } from "antd";
import { useMemo, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { DatatableColumn, DatatableColumnType, DatatableTable } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { propertyTypeIcon, propertyTypeLabel } from "../common/columnUtils";
import { COLUMN_TYPES } from "../common/constants";
import { datatablesApi } from "../common/datatablesApi";

const COLUMN_NAME_RE = /^[a-z][a-z0-9_]*$/;
const NEW_ID_PREFIX = "new:";

type DraftColumn = {
  id: string;
  name: string;
  type: DatatableColumnType;
  optionsText: string;
  required: boolean;
};

function toDraft(col: DatatableColumn): DraftColumn {
  return {
    id: col.id,
    name: col.name,
    type: col.type,
    optionsText: (col.options ?? []).join(", "),
    required: col.required,
  };
}

function createEmptyDraft(): DraftColumn {
  return {
    id: `${NEW_ID_PREFIX}${crypto.randomUUID()}`,
    name: "",
    type: "text",
    optionsText: "",
    required: false,
  };
}

function isNewDraft(draft: DraftColumn): boolean {
  return draft.id.startsWith(NEW_ID_PREFIX);
}

function parseOptions(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function optionsEqual(a: string[] | null | undefined, bText: string): boolean {
  const left = (a ?? []).join("\0");
  const right = parseOptions(bText).join("\0");
  return left === right;
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_");
}

function isDirty(orig: DatatableColumn, draft: DraftColumn): boolean {
  if (orig.name !== draft.name) return true;
  if (orig.type !== draft.type) return true;
  if (orig.required !== draft.required) return true;
  if (draft.type === "select") return !optionsEqual(orig.options, draft.optionsText);
  return (orig.options?.length ?? 0) > 0;
}

function fieldDirty(orig: DatatableColumn | undefined, draft: DraftColumn) {
  if (!orig) {
    return { name: true, type: true, required: draft.required, options: draft.type === "select" && !!draft.optionsText.trim() };
  }
  return {
    name: orig.name !== draft.name,
    type: orig.type !== draft.type,
    required: orig.required !== draft.required,
    options: draft.type === "select" ? !optionsEqual(orig.options, draft.optionsText) : (orig.options?.length ?? 0) > 0,
  };
}

function buildPatch(
  orig: DatatableColumn,
  draft: DraftColumn,
): Partial<{
  name: string;
  type: DatatableColumnType;
  options: string[] | null;
  required: boolean;
}> | null {
  if (!isDirty(orig, draft)) return null;
  const patch: Partial<{ name: string; type: DatatableColumnType; options: string[] | null; required: boolean }> = {};
  if (orig.name !== draft.name) patch.name = draft.name;
  if (orig.type !== draft.type) patch.type = draft.type;
  if (orig.required !== draft.required) patch.required = draft.required;

  if (draft.type === "select") {
    const nextOpts = parseOptions(draft.optionsText);
    if (!optionsEqual(orig.options, draft.optionsText) || orig.type !== "select") {
      patch.options = nextOpts;
    }
  } else if (orig.type === "select" || (orig.options?.length ?? 0) > 0) {
    patch.options = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function FieldLabel({ children, changed }: { children: React.ReactNode; changed?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      <span>{children}</span>
      {changed ? <span className="rounded bg-brand/15 px-1 py-px text-[10px] font-semibold normal-case tracking-normal text-brand-soft">edited</span> : null}
    </div>
  );
}

export function SchemaPropertiesDialog({
  tableId,
  tableName,
  columns,
  onClose,
  onSaved,
  onDeleted,
}: {
  tableId: string;
  tableName: string;
  columns: DatatableColumn[];
  onClose: () => void;
  onSaved: (table: DatatableTable, columns: DatatableColumn[]) => void;
  onDeleted?: () => void;
}) {
  const originals = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const [draftTableName, setDraftTableName] = useState(tableName);
  const [drafts, setDrafts] = useState<DraftColumn[]>(() => columns.map(toDraft));
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const tableNameDirty = draftTableName.trim() !== tableName;

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const draft of drafts) {
      if (deletedIds.has(draft.id)) continue;
      if (isNewDraft(draft)) {
        set.add(draft.id);
        continue;
      }
      const orig = originals.get(draft.id);
      if (orig && isDirty(orig, draft)) set.add(draft.id);
    }
    return set;
  }, [drafts, originals, deletedIds]);

  const activeDrafts = drafts.filter((d) => !deletedIds.has(d.id));
  const newCount = activeDrafts.filter(isNewDraft).length;
  const updateCount = [...dirtyIds].filter((id) => !id.startsWith(NEW_ID_PREFIX)).length;
  const deleteCount = deletedIds.size;
  const changeCount = newCount + updateCount + deleteCount + (tableNameDirty ? 1 : 0);

  const updateDraft = (id: string, patch: Partial<DraftColumn>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleNameChange = (id: string, raw: string) => {
    const next = raw
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    updateDraft(id, { name: next });
  };

  const handleAddProperty = () => {
    setDrafts((prev) => [...prev, createEmptyDraft()]);
    setError("");
  };

  /** Soft-delete existing props (visible until Save); hard-drop unsaved new drafts. */
  const handleMarkDelete = (id: string) => {
    if (id.startsWith(NEW_ID_PREFIX)) {
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } else {
      setDeletedIds((prev) => new Set(prev).add(id));
    }
    setError("");
  };

  const handleUndoDelete = (id: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setError("");
  };

  const handleDeleteTable = async () => {
    setDeleting(true);
    setError("");
    try {
      await datatablesApi.deleteTable(tableId);
      message.success("Table deleted");
      onDeleted?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async () => {
    const nextTableName = draftTableName.trim();
    if (!nextTableName) {
      setError("Table name is required");
      return;
    }

    const surviving = drafts.filter((d) => !deletedIds.has(d.id)).map((d) => ({ ...d, name: normalizeName(d.name) }));

    const used = new Map<string, string>();
    for (const draft of surviving) {
      if (!draft.name) {
        setError("Every property needs a name");
        return;
      }
      if (!COLUMN_NAME_RE.test(draft.name)) {
        setError(`"${draft.name}" must match [a-z][a-z0-9_]*`);
        return;
      }
      if (used.has(draft.name)) {
        setError(`Duplicate name "${draft.name}"`);
        return;
      }
      used.set(draft.name, draft.id);
    }

    const patches: Array<{ id: string; body: NonNullable<ReturnType<typeof buildPatch>> }> = [];
    const creates: DraftColumn[] = [];
    for (const draft of surviving) {
      if (isNewDraft(draft)) {
        creates.push(draft);
        continue;
      }
      const orig = originals.get(draft.id);
      if (!orig) continue;
      const body = buildPatch(orig, draft);
      if (body) patches.push({ id: draft.id, body });
    }

    const deletes = [...deletedIds];
    const rename = nextTableName !== tableName;

    if (!rename && patches.length === 0 && creates.length === 0 && deletes.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");
    try {
      const nextTable = rename ? await datatablesApi.updateTable(tableId, nextTableName) : ({ id: tableId, name: nextTableName } as DatatableTable);

      for (const id of deletes) {
        await datatablesApi.deleteColumn(id);
      }

      const columnById = new Map(columns.filter((c) => !deletedIds.has(c.id)).map((c) => [c.id, c]));
      for (const { id, body } of patches) {
        const updated = await datatablesApi.updateColumn(id, body);
        columnById.set(updated.id, updated);
      }

      const createdColumns: DatatableColumn[] = [];
      for (const draft of creates) {
        const created = await datatablesApi.createColumn(tableId, {
          name: draft.name,
          type: draft.type,
          options: draft.type === "select" ? parseOptions(draft.optionsText) : undefined,
          required: draft.required,
        });
        createdColumns.push(created);
      }

      const nextColumns: DatatableColumn[] = [
        ...surviving
          .filter((d) => !isNewDraft(d))
          .map((d) => columnById.get(d.id))
          .filter((c): c is DatatableColumn => !!c),
        ...createdColumns,
      ];

      const parts: string[] = [];
      if (rename) parts.push("Renamed table");
      if (deletes.length === 1) parts.push(parts.length ? "deleted 1 property" : "Deleted 1 property");
      else if (deletes.length > 1) parts.push(parts.length ? `deleted ${deletes.length} properties` : `Deleted ${deletes.length} properties`);
      if (creates.length === 1) parts.push(parts.length ? "added 1" : "Added 1 property");
      else if (creates.length > 1) parts.push(parts.length ? `added ${creates.length}` : `Added ${creates.length} properties`);
      if (patches.length === 1) parts.push(parts.length ? "updated 1" : "Updated 1 property");
      else if (patches.length > 1) parts.push(parts.length ? `updated ${patches.length}` : `Updated ${patches.length} properties`);
      message.success(parts.join(", "));

      onSaved(nextTable, nextColumns);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const okText = changeCount === 0 ? "Done" : changeCount === 1 ? (deleteCount === 1 ? "Delete 1 property" : newCount === 1 ? "Add 1 property" : tableNameDirty ? "Rename table" : "Save 1 change") : `Save ${changeCount} changes`;

  return (
    <Modal
      open
      title={
        <div className="pr-6">
          <div className="text-base font-semibold text-foreground">Edit table</div>
          <div className="mt-0.5 text-sm font-normal text-muted-foreground">{tableName}</div>
        </div>
      }
      onCancel={onClose}
      width={720}
      centered
      destroyOnHidden
      footer={
        <div className="flex items-center gap-3">
          <div className="mr-auto">
            <Button
              danger
              disabled={saving || deleting}
              loading={deleting}
              icon={<TrashBinMinimalisticIcon size={14} />}
              onClick={() => {
                Modal.confirm({
                  title: `Delete table "${tableName}"?`,
                  content: "All properties and rows in this table will be permanently deleted.",
                  okText: "Delete table",
                  okType: "danger",
                  onOk: handleDeleteTable,
                });
              }}
            >
              Delete table
            </Button>
          </div>
          <Button onClick={onClose} disabled={saving || deleting}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} disabled={deleting} onClick={() => void handleSubmit()}>
            {okText}
          </Button>
        </div>
      }
      styles={{
        body: {
          padding: "16px",
          maxHeight: "min(70vh, 720px)",
          overflowY: "auto",
        },
      }}
    >
      <div className="flex flex-col gap-4">
        <section className={cn("rounded-lg border bg-card p-4 transition-colors", tableNameDirty ? "border-brand/45 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-brand)_20%,transparent)]" : "border-border-subtle")}>
          <FieldLabel changed={tableNameDirty}>Table name</FieldLabel>
          <Input value={draftTableName} onChange={(e) => setDraftTableName(e.target.value)} placeholder="Table name" status={tableNameDirty ? "warning" : undefined} />
        </section>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Properties</div>
          <div className="text-xs text-muted-foreground">
            {activeDrafts.length} {activeDrafts.length === 1 ? "property" : "properties"}
          </div>
        </div>

        <RenderIf condition={drafts.length === 0}>
          <div className="rounded-lg border border-dashed border-border-subtle px-4 py-10 text-center text-sm text-muted-foreground">No properties yet</div>
        </RenderIf>

        {drafts.map((draft, index) => {
          const orig = originals.get(draft.id);
          const isNew = isNewDraft(draft);
          const markedDelete = deletedIds.has(draft.id);
          const dirty = !markedDelete && dirtyIds.has(draft.id);
          const dirtyFields = fieldDirty(orig, draft);

          return (
            <section key={draft.id} className={cn("rounded-lg border bg-card transition-colors", markedDelete ? "border-destructive/35 bg-destructive/4" : dirty ? "border-brand/45 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-brand)_20%,transparent)]" : "border-border-subtle")}>
              <header className={cn("flex items-center justify-between gap-3 border-b px-4 py-2.5", markedDelete ? "border-destructive/20 bg-destructive/6" : dirty ? "border-brand/20 bg-brand/5" : "border-border-subtle bg-secondary/60")}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums", markedDelete ? "bg-destructive/15 text-destructive" : dirty ? "bg-brand/15 text-brand-soft" : "bg-muted text-muted-foreground")}>{index + 1}</span>
                  <div className={cn("min-w-0 truncate text-sm font-semibold", markedDelete ? "text-muted-foreground line-through decoration-destructive/60" : "text-foreground")}>{draft.name || "unnamed"}</div>
                  {markedDelete ? (
                    <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">Will be deleted</span>
                  ) : isNew ? (
                    <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand-soft">New</span>
                  ) : dirty ? (
                    <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand-soft">Modified</span>
                  ) : null}
                </div>

                {markedDelete ? (
                  <button type="button" title="Undo delete" onClick={() => handleUndoDelete(draft.id)} className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                    <RestartIcon size={13} />
                    Undo
                  </button>
                ) : isNew ? (
                  <button type="button" title="Remove" onClick={() => handleMarkDelete(draft.id)} className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <TrashBinMinimalisticIcon size={14} />
                  </button>
                ) : (
                  <Popconfirm title={`Delete ${draft.name || "this property"}?`} description="It will be removed when you save. Existing row values will be lost." okText="Mark delete" okButtonProps={{ danger: true }} onConfirm={() => handleMarkDelete(draft.id)}>
                    <button type="button" title="Mark for deletion" className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <TrashBinMinimalisticIcon size={14} />
                    </button>
                  </Popconfirm>
                )}
              </header>

              {markedDelete ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">This property (and its row values) will be removed when you save.</div>
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-4 sm:grid-cols-12">
                  <div className="min-w-0 sm:col-span-5">
                    <FieldLabel changed={dirtyFields.name}>Name</FieldLabel>
                    <Input value={draft.name} onChange={(e) => handleNameChange(draft.id, e.target.value)} placeholder="status" status={dirtyFields.name ? "warning" : undefined} autoFocus={isNew && !draft.name} />
                  </div>

                  <div className="min-w-0 sm:col-span-4">
                    <FieldLabel changed={dirtyFields.type}>Type</FieldLabel>
                    <Select
                      value={draft.type}
                      onChange={(type) => updateDraft(draft.id, { type })}
                      className="w-full"
                      popupMatchSelectWidth={false}
                      options={COLUMN_TYPES.map((t) => ({
                        value: t,
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-muted-foreground">{propertyTypeIcon(t)}</span>
                            {propertyTypeLabel(t)}
                          </span>
                        ),
                      }))}
                      status={dirtyFields.type ? "warning" : undefined}
                    />
                  </div>

                  <div className="min-w-0 sm:col-span-3">
                    <FieldLabel changed={dirtyFields.required}>Required</FieldLabel>
                    <div className={cn("flex h-8 items-center gap-2 rounded-md border px-2.5", dirtyFields.required ? "border-brand/40 bg-brand/5" : "border-border-subtle bg-background")}>
                      <Switch size="small" checked={draft.required} onChange={(required) => updateDraft(draft.id, { required })} />
                      <span className="text-xs text-muted-foreground">{draft.required ? "Yes" : "No"}</span>
                    </div>
                  </div>

                  {draft.type === "select" ? (
                    <div className="min-w-0 sm:col-span-12">
                      <FieldLabel changed={dirtyFields.options}>Options</FieldLabel>
                      <Input value={draft.optionsText} onChange={(e) => updateDraft(draft.id, { optionsText: e.target.value })} placeholder="active, inactive, pending" status={dirtyFields.options ? "warning" : undefined} />
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}

        <Button type="dashed" block icon={<AddCircleIcon size={14} />} onClick={handleAddProperty} className="h-10!">
          Add property
        </Button>

        <RenderIf condition={!!error}>
          <p className="mb-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        </RenderIf>
        <RenderIf condition={changeCount > 0 && !error}>
          <p className="mb-0 text-xs text-muted-foreground">
            {`${[tableNameDirty ? "table renamed" : null, deleteCount > 0 ? (deleteCount === 1 ? "1 will be deleted" : `${deleteCount} will be deleted`) : null, newCount > 0 ? (newCount === 1 ? "1 new" : `${newCount} new`) : null, updateCount > 0 ? (updateCount === 1 ? "1 modified" : `${updateCount} modified`) : null]
              .filter(Boolean)
              .join(", ")} — applied when you save.`}
          </p>
        </RenderIf>
      </div>
    </Modal>
  );
}
