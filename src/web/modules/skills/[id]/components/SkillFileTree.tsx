import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { BookBookmarkIcon } from "@solar-icons/react/dynamic/book-bookmark";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { FileTextIcon } from "@solar-icons/react/dynamic/file-text";
import { FolderIcon } from "@solar-icons/react/dynamic/folder";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { Form, Input, Modal, message } from "antd";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { SkillReference } from "src/common/types";
import { slugify } from "src/common/utils/slug";

export type SkillEditorFile = { kind: "skill"; path: "SKILL.md" } | { kind: "reference"; path: string; refId: string; name: string };

interface SkillFileTreeProps {
  references: SkillReference[];
  selected: SkillEditorFile;
  dirtyPaths: Set<string>;
  draftPaths: Set<string>;
  onSelect: (file: SkillEditorFile) => void;
  onCreateReference: (body: { name: string; title: string }) => Promise<void>;
  onDeleteReference: (refId: string) => Promise<void>;
}

const PANEL_DEFAULT = 220;
const PANEL_MIN = 160;
const PANEL_MAX = 420;
const REF_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function SkillFileTree({ references, selected, dirtyPaths, draftPaths, onSelect, onCreateReference, onDeleteReference }: SkillFileTreeProps) {
  const sortedRefs = useMemo(() => [...references].sort((a, b) => a.name.localeCompare(b.name)), [references]);
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({ name: "", title: "" });
  const nameTouched = useRef(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  const handleDragMouseMove = (e: MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    setWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startW + dx)));
  };

  const handleDragMouseUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    document.removeEventListener("mousemove", handleDragMouseMove);
    document.removeEventListener("mouseup", handleDragMouseUp);
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: width };
    setIsDragging(true);
    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);
  };

  const openCreate = () => {
    nameTouched.current = false;
    setForm({ name: "", title: "" });
    setCreateError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    const name = form.name.trim();
    if (!title) {
      setCreateError("Title is required");
      return;
    }
    if (!name) {
      setCreateError("Name is required");
      return;
    }
    if (!REF_NAME_RE.test(name)) {
      setCreateError("Name must be lowercase kebab-case (a-z, 0-9, hyphens)");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await onCreateReference({ name, title });
      setCreateOpen(false);
      message.success("Reference created");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (ref: SkillReference) => {
    Modal.confirm({
      title: `Delete "${ref.name}.md"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await onDeleteReference(ref.id);
        message.success("Reference deleted");
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 shrink-0">
      <aside className="flex h-full min-h-0 flex-col bg-card" style={{ width }}>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <BookBookmarkIcon size={14} weight="BoldDuotone" className="shrink-0 text-edge-skill" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Files</span>
          <button type="button" onClick={openCreate} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Add reference" aria-label="Add reference">
            <AddCircleIcon size={14} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5 text-[13px] font-medium">
          <TreeRow active={selected.kind === "skill"} dirty={dirtyPaths.has("SKILL.md")} aiDraft={draftPaths.has("SKILL.md")} onClick={() => onSelect({ kind: "skill", path: "SKILL.md" })} icon={<FileTextIcon size={14} weight="BoldDuotone" className="shrink-0 opacity-90" />} title="SKILL.md">
            SKILL.md
          </TreeRow>

          <div className="mt-1 flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            <FolderIcon size={14} className="shrink-0 opacity-80" />
            <span className="truncate">references/</span>
          </div>

          {sortedRefs.length === 0 ? (
            <p className="m-0 px-2 py-1 pl-7 text-xs text-muted-foreground">No references yet</p>
          ) : (
            sortedRefs.map((ref) => {
              const path = `references/${ref.name}.md`;
              const label = `${ref.name}.md`;
              return (
                <TreeRow
                  key={ref.id}
                  indent
                  active={selected.kind === "reference" && selected.refId === ref.id}
                  dirty={dirtyPaths.has(path)}
                  aiDraft={draftPaths.has(path)}
                  onClick={() => onSelect({ kind: "reference", path, refId: ref.id, name: ref.name })}
                  icon={<DocumentTextIcon size={14} className="shrink-0 opacity-75" />}
                  title={label}
                  action={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ref);
                      }}
                      className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      title="Delete reference"
                      aria-label={`Delete ${label}`}
                    >
                      <TrashBinTrashIcon size={12} />
                    </button>
                  }
                >
                  <span className="font-mono text-[12px] font-medium">{label}</span>
                </TreeRow>
              );
            })
          )}
        </nav>
      </aside>

      <div onMouseDown={startDrag} className={cn("z-10 h-full w-px shrink-0 cursor-col-resize transition-colors duration-150", isDragging ? "bg-brand/60" : "bg-border hover:bg-brand/40")} />

      <Modal open={createOpen} title="New reference" onCancel={() => setCreateOpen(false)} onOk={() => void handleCreate()} okText="Create" confirmLoading={creating} destroyOnHidden>
        {createError ? <p className="mb-3 text-sm text-destructive">{createError}</p> : null}
        <Form layout="vertical">
          <Form.Item label="Title" required>
            <Input
              value={form.title}
              placeholder="Edge cases"
              onChange={(e) => {
                const title = e.target.value;
                setForm((f) => ({
                  title,
                  name: nameTouched.current ? f.name : slugify(title),
                }));
              }}
            />
          </Form.Item>
          <Form.Item label="Name" required extra="Lowercase kebab-case slug used in the path">
            <Input
              value={form.name}
              placeholder="edge-cases"
              onChange={(e) => {
                nameTouched.current = true;
                setForm((f) => ({ ...f, name: e.target.value }));
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function TreeRow({
  children,
  icon,
  active,
  dirty,
  aiDraft,
  indent,
  title,
  action,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  dirty?: boolean;
  aiDraft?: boolean;
  indent?: boolean;
  title?: string;
  action?: ReactNode;
  onClick: () => void;
}) {
  return (
    <div className={cn("group flex w-full items-center gap-0.5 py-0.5 pr-1.5 transition-colors", indent ? "pl-7" : "pl-2", active ? "bg-accent text-brand-soft" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
      <button type="button" onClick={onClick} title={title} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 text-left">
        {icon}
        <span className="min-w-0 flex-1 truncate tracking-tight">{children}</span>
        {aiDraft && <span className="shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide text-brand-soft bg-accent">AI</span>}
        {dirty && !aiDraft && <span className="size-1.5 shrink-0 rounded-full bg-brand-soft" />}
      </button>
      {action}
    </div>
  );
}
