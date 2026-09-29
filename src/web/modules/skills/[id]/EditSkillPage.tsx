import { Alert, Button, FluentIcon, Modal, Splitter, message } from "devnonla-ui";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { wsClient } from "src/common/api/wsClient";
import type { Skill, SkillReference } from "src/common/types";
import { AgentSidePanel } from "src/components/AgentSidePanel";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch } from "src/store/store";
import { ensureSkillMarkdown, parseSkillFrontmatter } from "../common/frontmatter";
import { skillsApi } from "../common/skillsApi";
import { deleteSkill, updateSkill, upsertSkillLocal } from "../common/skillsSlice";
import { EditSkillHeader, type SkillViewMode } from "./components/EditSkillHeader";
import { SkillAgentPanel } from "./components/SkillAgentPanel";
import { type SkillEditorFile, type SkillFileMark, SkillFileTree } from "./components/SkillFileTree";
import { SkillMarkdownPreview } from "./components/SkillMarkdownPreview";

function EditSkillSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-55 shrink-0 border-r border-border bg-card p-3">
          <div className="mb-3 h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="mb-2 h-7 w-full animate-pulse rounded-md bg-muted" />
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mb-1.5 h-6 w-full animate-pulse rounded-md bg-muted/70" />
          <div className="h-6 w-4/5 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="min-w-0 flex-1 border-r border-border">
          <div className="h-10 border-b border-border bg-card/80 px-3 py-3">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 p-4">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          </div>
        </div>
        <div className="w-100 shrink-0 bg-card p-3">
          <div className="mb-4 h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="mx-auto mt-16 h-3 w-48 animate-pulse rounded bg-muted/60" />
          <div className="mx-auto mt-3 h-8 w-52 animate-pulse rounded-lg bg-muted/50" />
          <div className="mx-auto mt-2 h-8 w-52 animate-pulse rounded-lg bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

function pendingDraft(published: string, draft: string | null | undefined): string | null {
  if (draft == null || draft === "") return null;
  return draft !== published ? draft : null;
}

export default function EditSkillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [refs, setRefs] = useState<SkillReference[]>([]);
  const [selected, setSelected] = useState<SkillEditorFile>({ kind: "skill", path: "SKILL.md" });
  const [skillDraft, setSkillDraft] = useState("");
  const [savedSkill, setSavedSkill] = useState("");
  const [refDrafts, setRefDrafts] = useState<Record<string, string>>({});
  const [savedRefs, setSavedRefs] = useState<Record<string, string>>({});
  const [aiDrafts, setAiDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<SkillViewMode>("preview");
  const [agentGenerating, setAgentGenerating] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const skillDraftRef = useRef(skillDraft);
  skillDraftRef.current = skillDraft;
  const refDraftsRef = useRef(refDrafts);
  refDraftsRef.current = refDrafts;
  const savedSkillRef = useRef(savedSkill);
  savedSkillRef.current = savedSkill;

  const syncAiDraftsFromServer = useCallback((s: Skill, references: SkillReference[]) => {
    const next: Record<string, string> = {};
    const skillMd = ensureSkillMarkdown(s.content, s.name, s.description);
    const skillPending = pendingDraft(skillMd, s.draftContent);
    if (skillPending) next["SKILL.md"] = skillPending;
    for (const r of references) {
      const path = `references/${r.name}.md`;
      const pending = pendingDraft(r.content, r.draftContent);
      if (pending) next[path] = pending;
    }
    setAiDrafts(next);
  }, []);

  const applyServerState = useCallback(
    (s: Skill, references: SkillReference[], hintPath?: string) => {
      dispatch(upsertSkillLocal(s));
      setSkill(s);
      const md = ensureSkillMarkdown(s.content, s.name, s.description);
      const localWasClean = skillDraftRef.current === savedSkillRef.current;
      setSavedSkill(md);
      if (localWasClean) setSkillDraft(md);

      const ids = new Set(references.map((r) => r.id));
      setRefs(references);
      setSavedRefs(() => {
        const nextSaved: Record<string, string> = {};
        for (const r of references) nextSaved[r.id] = r.content;
        return nextSaved;
      });
      setRefDrafts((prevLocal) => {
        const nextLocal: Record<string, string> = {};
        for (const r of references) {
          nextLocal[r.id] = r.id in prevLocal ? prevLocal[r.id]! : r.content;
        }
        return nextLocal;
      });
      syncAiDraftsFromServer(s, references);

      if (selectedRef.current.kind === "reference" && !ids.has(selectedRef.current.refId)) {
        setSelected({ kind: "skill", path: "SKILL.md" });
      } else if (hintPath === "SKILL.md") {
        setSelected({ kind: "skill", path: "SKILL.md" });
      } else if (hintPath) {
        const ref = references.find((r) => `references/${r.name}.md` === hintPath);
        if (ref) {
          setSelected({ kind: "reference", path: hintPath, refId: ref.id, name: ref.name });
        }
      }
    },
    [dispatch, syncAiDraftsFromServer],
  );

  const load = useCallback(async () => {
    if (!id) return;
    const [s, references] = await Promise.all([skillsApi.get(id), skillsApi.listReferences(id)]);
    applyServerState(s, references);
  }, [id, applyServerState]);

  useEffect(() => {
    load().catch(() => setError("Failed to load skill"));
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const unsub = wsClient.on<Skill>("skills:updated", (payload) => {
      if (payload.id !== id) return;
      void skillsApi.listReferences(id).then((list) => applyServerState(payload, list));
    });
    return unsub;
  }, [id, applyServerState]);

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>();
    if (skillDraft !== savedSkill) set.add("SKILL.md");
    for (const r of refs) {
      if ((refDrafts[r.id] ?? "") !== (savedRefs[r.id] ?? "")) {
        set.add(`references/${r.name}.md`);
      }
    }
    return set;
  }, [skillDraft, savedSkill, refs, refDrafts, savedRefs]);

  const draftPaths = useMemo(() => new Set(Object.keys(aiDrafts)), [aiDrafts]);

  const fileMarks = useMemo(() => {
    const marks: Record<string, SkillFileMark> = {};
    if (skill) {
      const published = ensureSkillMarkdown(skill.content, skill.name, skill.description);
      const pending = pendingDraft(published, skill.draftContent);
      if (pending || dirtyPaths.has("SKILL.md")) {
        marks["SKILL.md"] = pending && !published.trim() ? "new" : "modified";
      }
    }
    for (const r of refs) {
      const path = `references/${r.name}.md`;
      const pending = pendingDraft(r.content, r.draftContent);
      if (pending && !(r.content ?? "").trim()) marks[path] = "new";
      else if (pending || dirtyPaths.has(path)) marks[path] = "modified";
    }
    return marks;
  }, [skill, refs, dirtyPaths]);

  const draftFileList = useMemo(() => {
    const sorted = [...refs].sort((a, b) => a.name.localeCompare(b.name));
    const order = ["SKILL.md", ...sorted.map((r) => `references/${r.name}.md`)];
    return order.filter((path) => draftPaths.has(path));
  }, [refs, draftPaths]);

  const isDirty = dirtyPaths.size > 0;

  const editorValue = selected.kind === "skill" ? skillDraft : (refDrafts[selected.refId] ?? "");
  const selectedAiDraft = aiDrafts[selected.path] ?? null;
  const showDiff = selectedAiDraft != null && selectedAiDraft !== editorValue;
  const previewValue = selectedAiDraft ?? editorValue;
  const previewFilePaths = useMemo(() => ["SKILL.md", ...refs.map((r) => `references/${r.name}.md`)], [refs]);

  const selectFileByPath = useCallback(
    (path: string) => {
      if (path === "SKILL.md") {
        setSelected({ kind: "skill", path: "SKILL.md" });
        return;
      }
      const ref = refs.find((r) => `references/${r.name}.md` === path);
      if (ref) {
        setSelected({ kind: "reference", path, refId: ref.id, name: ref.name });
      }
    },
    [refs],
  );

  const handleReviewNext = useCallback(() => {
    if (draftFileList.length === 0) return;
    const idx = draftFileList.indexOf(selected.path);
    const next = idx === -1 ? draftFileList[0] : draftFileList[(idx + 1) % draftFileList.length];
    selectFileByPath(next);
  }, [draftFileList, selected.path, selectFileByPath]);

  const handleEditorChange = (value: string | undefined) => {
    const next = value ?? "";
    if (selected.kind === "skill") {
      setSkillDraft(next);
    } else {
      setRefDrafts((prev) => ({ ...prev, [selected.refId]: next }));
    }
  };

  const handleSave = async (opts?: { quiet?: boolean }): Promise<boolean> => {
    if (!id || !skill) return true;
    setSaving(true);
    setError("");
    try {
      if (skillDraft !== savedSkill) {
        const updated = (await dispatch(updateSkill({ id, content: skillDraft })).unwrap()) as Skill;
        const md = ensureSkillMarkdown(updated.content, updated.name, updated.description);
        setSkill(updated);
        setSkillDraft(md);
        setSavedSkill(md);
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next["SKILL.md"];
          return next;
        });
      }
      for (const r of refs) {
        const draft = refDrafts[r.id] ?? "";
        if (draft !== (savedRefs[r.id] ?? "")) {
          await skillsApi.updateReference(id, r.id, { content: draft });
        }
      }
      const references = await skillsApi.listReferences(id);
      setRefs(references);
      const map: Record<string, string> = {};
      for (const r of references) map[r.id] = r.content;
      setRefDrafts(map);
      setSavedRefs({ ...map });
      syncAiDraftsFromServer((await skillsApi.get(id)) as Skill, references);
      if (!opts?.quiet) message.success("Saved");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      if (!opts?.quiet) message.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleViewModeChange = async (next: SkillViewMode) => {
    if (next === viewMode) return;
    if (viewMode === "editor" && isDirty) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setViewMode(next);
  };

  const handleDelete = () => {
    if (!id || !skill) return;
    Modal.confirm({
      title: `Delete "${skill.name}"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await dispatch(deleteSkill(id)).unwrap();
        message.success("Deleted");
        navigate("/skills");
      },
    });
  };

  const handleCreateReference = useCallback(
    async (body: { name: string; title: string }) => {
      if (!id) return;
      const created = await skillsApi.createReference(id, body);
      setRefs((prev) => [...prev, created]);
      setRefDrafts((d) => ({ ...d, [created.id]: created.content }));
      setSavedRefs((d) => ({ ...d, [created.id]: created.content }));
      setSelected({
        kind: "reference",
        path: `references/${created.name}.md`,
        refId: created.id,
        name: created.name,
      });
      setViewMode("editor");
    },
    [id],
  );

  const handleDeleteReference = useCallback(
    async (refId: string) => {
      if (!id) return;
      const removed = refs.find((r) => r.id === refId);
      await skillsApi.deleteReference(id, refId);
      setRefs((prev) => prev.filter((r) => r.id !== refId));
      setRefDrafts((d) => {
        const next = { ...d };
        delete next[refId];
        return next;
      });
      setSavedRefs((d) => {
        const next = { ...d };
        delete next[refId];
        return next;
      });
      if (removed) {
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next[`references/${removed.name}.md`];
          return next;
        });
      }
      if (selectedRef.current.kind === "reference" && selectedRef.current.refId === refId) {
        setSelected({ kind: "skill", path: "SKILL.md" });
      }
    },
    [id, refs],
  );

  const confirmDeleteReference = () => {
    if (selected.kind !== "reference") return;
    Modal.confirm({
      title: `Delete "${selected.name}.md"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDeleteReference(selected.refId);
        message.success("Reference deleted");
      },
    });
  };

  const handleAcceptAiDraft = async () => {
    if (!id || !selectedAiDraft) return;
    const draft = selectedAiDraft;
    setApproving(true);
    try {
      if (selected.kind === "skill") {
        const updated = (await dispatch(updateSkill({ id, content: draft })).unwrap()) as Skill;
        const md = ensureSkillMarkdown(updated.content, updated.name, updated.description);
        setSkill(updated);
        setSkillDraft(md);
        setSavedSkill(md);
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next["SKILL.md"];
          return next;
        });
      } else {
        await skillsApi.updateReference(id, selected.refId, { content: draft });
        setRefDrafts((prev) => ({ ...prev, [selected.refId]: draft }));
        setSavedRefs((prev) => ({ ...prev, [selected.refId]: draft }));
        setRefs((prev) => prev.map((r) => (r.id === selected.refId ? { ...r, content: draft, draftContent: draft } : r)));
        setAiDrafts((prev) => {
          const next = { ...prev };
          delete next[selected.path];
          return next;
        });
      }
      message.success("Draft approved");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setApproving(false);
    }
  };

  const handleRejectAiDraft = async () => {
    if (!id) return;
    setDiscarding(true);
    try {
      if (selected.kind === "reference" && fileMarks[selected.path] === "new") {
        await handleDeleteReference(selected.refId);
        message.success("File removed");
        return;
      }
      const published = editorValue;
      if (selected.kind === "skill") {
        await skillsApi.update(id, { draftContent: published });
        setSkill((prev) => (prev ? { ...prev, draftContent: published } : prev));
      } else {
        await skillsApi.updateReference(id, selected.refId, { draftContent: published });
        setRefs((prev) => prev.map((r) => (r.id === selected.refId ? { ...r, draftContent: published } : r)));
      }
      setAiDrafts((prev) => {
        const next = { ...prev };
        delete next[selected.path];
        return next;
      });
      message.success("Draft discarded");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscarding(false);
    }
  };

  const headerTitle = useMemo(() => {
    const parsed = parseSkillFrontmatter(skillDraft);
    return parsed.frontmatter.name?.trim() || skill?.name || "Skill";
  }, [skillDraft, skill?.name]);

  const reviewBar =
    draftFileList.length > 0 && !agentGenerating ? (
      <DraftReviewBar
        changedFiles={draftFileList}
        currentFile={selected.path}
        onReviewNext={handleReviewNext}
        onApprove={() => void handleAcceptAiDraft()}
        onDiscard={() => void handleRejectAiDraft()}
        approving={approving}
        discarding={discarding}
        discardConfirm={
          fileMarks[selected.path] === "new"
            ? {
                title: `Delete ${selected.path}?`,
                description: "This file only exists as a draft. Discarding removes it. Other draft files are kept.",
              }
            : undefined
        }
      />
    ) : null;

  if (!id) return null;

  if (!skill) {
    return <EditSkillSkeleton />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <EditSkillHeader title={headerTitle} viewMode={viewMode} onViewModeChange={(mode) => void handleViewModeChange(mode)} onDelete={handleDelete} agentOpen={agentOpen} onToggleAgent={() => setAgentOpen((v) => !v)} />

      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon closable={{ onClose: () => setError("") }} className="m-3" />
      </RenderIf>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Splitter className="min-h-0 min-w-0 flex-1">
          <Splitter.Panel defaultSize={220} min={160} max={420} className="min-h-0 overflow-hidden">
            <SkillFileTree references={refs} selected={selected} fileMarks={fileMarks} onSelect={setSelected} onCreateReference={handleCreateReference} />
          </Splitter.Panel>
          <Splitter.Panel min={280} className="min-h-0 overflow-hidden">
            <main className="relative flex h-full min-h-0 min-w-0 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{selected.path}</span>
                {selected.kind === "reference" ? (
                  <button type="button" onClick={confirmDeleteReference} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive" title="Delete reference" aria-label={`Delete ${selected.name}.md`}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>

              {viewMode === "preview" ? (
                <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
                  <div className="h-full overflow-y-auto">
                    <SkillMarkdownPreview content={previewValue} showFrontmatter={selected.kind === "skill"} filePaths={previewFilePaths} onOpenFile={selectFileByPath} />
                  </div>
                  <AnimatePresence>
                    {reviewBar ? (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
                        <div className="pointer-events-auto">{reviewBar}</div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="monaco-scroll-pad-x relative min-h-0 flex-1 overflow-hidden">
                  {showDiff && selectedAiDraft != null ? (
                    <MonacoDiffEditor
                      key={`diff-${selected.path}`}
                      language="markdown"
                      original={editorValue}
                      modified={selectedAiDraft}
                      height="100%"
                      options={{
                        fontSize: 14,
                        wordWrap: "on",
                        renderSideBySide: false,
                        renderIndicators: false,
                        lineNumbers: "off",
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                      }}
                    />
                  ) : (
                    <MonacoEditor
                      key={selected.path}
                      language="markdown"
                      value={editorValue}
                      onChange={handleEditorChange}
                      onSave={() => void handleSave()}
                      height="100%"
                      options={{
                        fontSize: 14,
                        wordWrap: "on",
                        lineNumbers: "off",
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        guides: { indentation: false, highlightActiveIndentation: false },
                      }}
                    />
                  )}

                  <AnimatePresence>
                    {isDirty || reviewBar ? (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
                        {isDirty ? (
                          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-700" />
                            <span className="mr-1 text-xs font-medium tracking-wide text-brand-700">Unsaved</span>
                            <Button size="small" type="primary" icon={!saving ? <FluentIcon name="document-24" size={14} /> : undefined} loading={saving} onClick={() => void handleSave()}>
                              {saving ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        ) : null}
                        {reviewBar}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}
            </main>
          </Splitter.Panel>
        </Splitter>

        <AgentSidePanel open={agentOpen}>
          <SkillAgentPanel
            skillId={id}
            onServerSync={applyServerState}
            onGeneratingChange={setAgentGenerating}
            onBeforeSend={async () => {
              if (viewMode !== "editor" || !isDirty) return;
              await handleSave({ quiet: true });
            }}
          />
        </AgentSidePanel>
      </div>
    </div>
  );
}
