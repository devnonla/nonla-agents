import { Button, FluentIcon, Popover, Splitter, message } from "devnonla-ui";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import type * as MonacoNS from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "src/common/lib/cn";
import type { Agent } from "src/common/types";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { MarkdownPreview } from "src/components/MarkdownPreview";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import { updateAgent, upsertAgentLocal } from "src/modules/agents/common/agentsSlice";
import { useAppDispatch } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { PromptAgentPanel } from "./PromptAgentPanel";

type InstructViewMode = "preview" | "editor";

const VIEW_OPTIONS: { value: InstructViewMode; label: string; icon: string }[] = [
  { value: "preview", label: "Preview", icon: "search-visual-24" },
  { value: "editor", label: "Editor", icon: "code-24" },
];

const EDITOR_OPTIONS: MonacoNS.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  lineHeight: 1.7,
  padding: { top: 20, bottom: 24 },
  lineNumbers: "off",
  folding: false,
  renderLineHighlight: "none",
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  wordWrap: "on",
};

const PLACEHOLDER = "Write instructions for this agent…\n\nPersonality, rules, tone, and what it should do.";

function pendingDraft(published: string, draft: string | null | undefined): string | null {
  if (draft == null || draft === "") return null;
  return draft !== published ? draft : null;
}

function ViewModeMenu({ value, onChange }: { value: InstructViewMode; onChange: (mode: InstructViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const current = VIEW_OPTIONS.find((opt) => opt.value === value) ?? VIEW_OPTIONS[0];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      getPopupContainer={() => document.body}
      styles={{ root: { width: 240 }, container: { width: 240, padding: 6 } }}
      content={
        <div className="flex flex-col">
          <p className="m-0 px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">View</p>
          <div className="flex flex-col gap-0.5">
            {VIEW_OPTIONS.map((opt) => {
              const active = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onChange(opt.value);
                  }}
                  className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-2.5 py-2 text-left font-[inherit] text-[13px] font-medium transition-colors duration-100", active ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
                >
                  <FluentIcon name={opt.icon} size={16} className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1">{opt.label}</span>
                  {active ? <Check size={14} className="shrink-0 text-brand-700" /> : <span className="size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      <Button type="text" size="small" icon={<FluentIcon name={current.icon} size={14} />} aria-label="View mode">
        {current.label}
      </Button>
    </Popover>
  );
}

export function PromptPage() {
  const { id, systemPrompt, setSystemPrompt, agent } = useAgentDetailContext();

  const editorRef = useRef<EditorInstance | null>(null);
  const [viewMode, setViewMode] = useState<InstructViewMode>("preview");
  const [agentGenerating, setAgentGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const dispatch = useAppDispatch();

  const published = agent.systemPrompt ?? "";
  const aiDraft = pendingDraft(published, agent.systemPromptDraft);
  const previewValue = aiDraft ?? systemPrompt;
  const showDiff = aiDraft != null && aiDraft !== systemPrompt;

  const [savedPrompt, setSavedPrompt] = useState(published);
  const [saving, setSaving] = useState(false);
  const dirty = systemPrompt !== savedPrompt;
  const promptRef = useRef(systemPrompt);
  promptRef.current = systemPrompt;
  const savedPromptRef = useRef(savedPrompt);
  savedPromptRef.current = savedPrompt;
  const savingRef = useRef(false);

  const applyPrompt = useCallback(
    (newPrompt: string) => {
      const editor = editorRef.current;
      const monacoModel = editor?.getModel();
      if (!editor || !monacoModel) {
        setSystemPrompt(newPrompt);
        return;
      }
      if (newPrompt === monacoModel.getValue()) return;
      editor.executeEdits("ai-update", [
        {
          range: monacoModel.getFullModelRange(),
          text: newPrompt,
        },
      ]);
      setSystemPrompt(newPrompt);
    },
    [setSystemPrompt],
  );

  const lastPublishedRef = useRef(published);
  useEffect(() => {
    if (published === lastPublishedRef.current) return;
    lastPublishedRef.current = published;
    const localWasClean = promptRef.current === savedPromptRef.current;
    savedPromptRef.current = published;
    setSavedPrompt(published);
    if (localWasClean) applyPrompt(published);
  }, [published, applyPrompt]);

  const savePrompt = useCallback(
    async (opts?: { quiet?: boolean }): Promise<boolean> => {
      const next = promptRef.current;
      if (next === savedPromptRef.current) return true;
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      try {
        await dispatch(updateAgent({ id, systemPrompt: next || null })).unwrap();
        lastPublishedRef.current = next;
        savedPromptRef.current = next;
        setSavedPrompt(next);
        if (!opts?.quiet) message.success("Saved");
        return true;
      } catch {
        if (!opts?.quiet) message.error("Failed to save prompt");
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [dispatch, id],
  );

  const handleChange = useCallback(
    (v: string | undefined) => {
      setSystemPrompt(v ?? "");
    },
    [setSystemPrompt],
  );

  const handleViewModeChange = useCallback(
    async (next: InstructViewMode) => {
      if (next === viewMode) return;
      if (viewMode === "editor" && dirty) {
        const ok = await savePrompt();
        if (!ok) return;
      }
      setViewMode(next);
    },
    [viewMode, dirty, savePrompt],
  );

  const handleApprove = async () => {
    if (!aiDraft) return;
    setApproving(true);
    try {
      await dispatch(updateAgent({ id, systemPrompt: aiDraft })).unwrap();
      lastPublishedRef.current = aiDraft;
      savedPromptRef.current = aiDraft;
      setSavedPrompt(aiDraft);
      applyPrompt(aiDraft);
      message.success("Draft approved");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to approve draft");
    } finally {
      setApproving(false);
    }
  };

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      await dispatch(updateAgent({ id, systemPromptDraft: published })).unwrap();
      message.success("Draft discarded");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to discard draft");
    } finally {
      setDiscarding(false);
    }
  };

  const handleServerSync = useCallback(
    (next: Agent) => {
      dispatch(upsertAgentLocal(next));
    },
    [dispatch],
  );

  const isEmpty = !systemPrompt || systemPrompt.trim().length === 0;
  const reviewBar =
    aiDraft && !agentGenerating ? (
      <DraftReviewBar
        onApprove={() => void handleApprove()}
        onDiscard={() => void handleDiscard()}
        approving={approving}
        discarding={discarding}
        discardConfirm={{
          title: "Discard draft?",
          description: "Reset to the published prompt. Unpublished changes will be lost.",
        }}
      />
    ) : null;

  if (!id) return null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <Splitter className="min-h-0 min-w-0 flex-1">
        <Splitter.Panel min={320} className="min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
              <FluentIcon name="notebook-24" size={14} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Instruct</span>
              {aiDraft ? <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-700">Draft changes</span> : null}
              <ViewModeMenu value={viewMode} onChange={(mode) => void handleViewModeChange(mode)} />
            </header>

            {viewMode === "preview" ? (
              <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
                <div className="h-full overflow-y-auto">
                  <article className="mx-auto w-full max-w-2xl px-6 py-8">
                    <MarkdownPreview
                      content={previewValue}
                      empty={
                        <div className="flex flex-col items-start gap-3">
                          <p className="m-0 text-sm text-muted-foreground">No instructions yet.</p>
                          <Button size="small" onClick={() => setViewMode("editor")}>
                            Open editor
                          </Button>
                        </div>
                      }
                    />
                  </article>
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
              <div className="monaco-scroll-pad-x relative min-h-0 flex-1 overflow-hidden bg-background">
                {showDiff && aiDraft != null ? (
                  <MonacoDiffEditor
                    language="markdown"
                    original={systemPrompt}
                    modified={aiDraft}
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
                  <>
                    <MonacoEditor
                      language="markdown"
                      value={systemPrompt}
                      onChange={handleChange}
                      onSave={() => void savePrompt()}
                      onMount={(editor) => {
                        editorRef.current = editor;
                        editor.onDidDispose(() => {
                          if (editorRef.current === editor) editorRef.current = null;
                        });
                      }}
                      options={EDITOR_OPTIONS}
                    />
                    {isEmpty ? (
                      <div className="pointer-events-none absolute inset-0 select-none px-5 pt-5">
                        <span className="whitespace-pre-wrap font-mono text-[14px] leading-[1.7] text-muted-foreground">{PLACEHOLDER}</span>
                      </div>
                    ) : null}
                  </>
                )}

                <AnimatePresence>
                  {dirty || reviewBar ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
                      {dirty ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-700" />
                          <span className="mr-1 text-xs font-medium tracking-wide text-brand-700">Unsaved</span>
                          <Button size="small" type="primary" icon={!saving ? <FluentIcon name="document-24" size={14} /> : undefined} loading={saving} onClick={() => void savePrompt()}>
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
          </div>
        </Splitter.Panel>

        <Splitter.Panel defaultSize={400} min={300} max={560} className="min-h-0 overflow-hidden">
          <PromptAgentPanel
            agentId={id}
            onServerSync={handleServerSync}
            onGeneratingChange={setAgentGenerating}
            onBeforeSend={async () => {
              if (viewMode !== "editor" || !dirty) return;
              await savePrompt({ quiet: true });
            }}
          />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
