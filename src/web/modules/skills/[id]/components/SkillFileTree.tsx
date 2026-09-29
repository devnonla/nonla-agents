import { EFormItemType, FluentIcon, Modal, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "src/common/lib/cn";
import type { SkillReference } from "src/common/types";
import { slugify } from "src/common/utils/slug";

export type SkillEditorFile = { kind: "skill"; path: "SKILL.md" } | { kind: "reference"; path: string; refId: string; name: string };
export type SkillFileMark = "new" | "modified";

interface SkillFileTreeProps {
  references: SkillReference[];
  selected: SkillEditorFile;
  fileMarks: Record<string, SkillFileMark>;
  onSelect: (file: SkillEditorFile) => void;
  onCreateReference: (body: { name: string; title: string }) => Promise<void>;
}

type RefValues = { title: string; name: string };

const REF_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "title",
    label: "Title",
    colSpan: 12,
    rules: {
      required: "Title is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Title is required"),
    },
    options: { placeholder: "Edge cases" },
  },
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      pattern: { value: "^[a-z0-9]+(?:-[a-z0-9]+)*$", message: "Name must be lowercase kebab-case (a-z, 0-9, hyphens)" },
    },
    options: { placeholder: "edge-cases" },
  },
];

export function SkillFileTree({ references, selected, fileMarks, onSelect, onCreateReference }: SkillFileTreeProps) {
  const sortedRefs = useMemo(() => [...references].sort((a, b) => a.name.localeCompare(b.name)), [references]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const form = useForm<RefValues>({ defaultValues: { title: "", name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;
  const nameTouched = useRef(false);

  const openCreate = () => {
    nameTouched.current = false;
    form.reset({ name: "", title: "" });
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen) return;
    const t = window.setTimeout(() => form.setFocus("title"), 150);
    return () => window.clearTimeout(t);
  }, [createOpen, form]);

  const onCreate = form.handleSubmit(async ({ title, name }) => {
    setCreating(true);
    try {
      await onCreateReference({ name: name.trim(), title: title.trim() });
      setCreateOpen(false);
      message.success("Reference created");
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  });

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-col bg-card">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <FluentIcon name="book-24" size={14} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Files</span>
          <button type="button" onClick={openCreate} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Add reference" aria-label="Add reference">
            <Plus size={14} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5 text-[13px] font-medium">
          <TreeRow active={selected.kind === "skill"} mark={fileMarks["SKILL.md"]} onClick={() => onSelect({ kind: "skill", path: "SKILL.md" })} icon={<FluentIcon name="document-text-24" size={14} className="shrink-0 opacity-90" />} title="SKILL.md">
            SKILL.md
          </TreeRow>

          <div className="mt-1 flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            <FluentIcon name="document-folder-24" size={14} className="shrink-0 opacity-80" />
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
                  mark={fileMarks[path]}
                  onClick={() => onSelect({ kind: "reference", path, refId: ref.id, name: ref.name })}
                  icon={<FluentIcon name="document-text-24" size={14} className="shrink-0 opacity-75" />}
                  title={label}
                >
                  <span className="text-[13px] font-medium">{label}</span>
                </TreeRow>
              );
            })
          )}
        </nav>
      </aside>

      <Modal open={createOpen} title="New reference" onCancel={() => setCreateOpen(false)} onOk={() => void onCreate()} okText="Create" confirmLoading={creating} destroyOnHidden>
        <form onSubmit={onCreate}>
          <SchemaForm
            form={form}
            items={REF_ITEMS}
            valuesChangeDebounce={0}
            onValuesChange={(all) => {
              const auto = slugify(all.title);
              if (all.name !== auto && all.name !== "") nameTouched.current = true;
              if (!nameTouched.current && all.name !== auto) form.setValue("name", auto);
            }}
          />
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">Lowercase kebab-case slug used in the path</p>
          {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
        </form>
      </Modal>
    </>
  );
}

function TreeRow({
  children,
  icon,
  active,
  mark,
  indent,
  title,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  mark?: SkillFileMark;
  indent?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <div className={cn("flex w-full items-center gap-0.5 py-0.5 pr-1.5 transition-colors", indent ? "pl-7" : "pl-2", active ? "bg-accent" : "hover:bg-muted/40", active ? "text-brand-700" : "text-muted-foreground hover:text-foreground")}>
      <button type="button" onClick={onClick} title={title} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 text-left">
        {icon}
        <span className={cn("min-w-0 flex-1 truncate tracking-tight", mark === "new" && "text-success", mark === "modified" && "text-warn")}>{children}</span>
      </button>
      <span className="flex w-3 shrink-0 items-center justify-center" title={mark === "new" ? "New file" : mark === "modified" ? "Modified" : undefined}>
        {mark ? <span className={cn("size-1.5 rounded-full", mark === "new" ? "bg-success" : "bg-warn")} /> : null}
      </span>
    </div>
  );
}
