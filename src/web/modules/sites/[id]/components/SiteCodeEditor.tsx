import { Button, message } from "@nonla-agents/ui";
import { BoxMinimalisticIcon } from "@solar-icons/react/dynamic/box-minimalistic";
import { CodeFileIcon } from "@solar-icons/react/dynamic/code-file";
import { DisketteIcon } from "@solar-icons/react/dynamic/diskette";
import { PaletteIcon } from "@solar-icons/react/dynamic/palette";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { Site, SiteSourceFile } from "src/common/types";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import type { Monaco } from "src/components/MonacoEditor";
import { MonacoEditor } from "src/components/MonacoEditor";
import { sitesApi } from "../../common/sitesApi";

const SOURCE_FILES: SiteSourceFile[] = ["app.tsx", "styles.css", "backend.ts", "package.json"];

const FILE_META: Record<SiteSourceFile, { language: string; icon: typeof CodeFileIcon }> = {
  "app.tsx": { language: "typescript", icon: CodeFileIcon },
  "styles.css": { language: "css", icon: PaletteIcon },
  "backend.ts": { language: "typescript", icon: ProgrammingIcon },
  "package.json": { language: "json", icon: BoxMinimalisticIcon },
};

export type SiteCodeEditorHandle = {
  flush: (opts?: { quiet?: boolean }) => Promise<void>;
};

interface SiteCodeEditorProps {
  siteId: string;
  reloadToken?: number;
  onSiteUpdated: (site: Site) => void;
  review?: {
    onApprove: (file: SiteSourceFile) => void | Promise<void>;
    onDiscard: (file: SiteSourceFile) => void | Promise<void>;
    approving: boolean;
    discarding: boolean;
  } | null;
}

function syncInactiveSiteModels(monacoInstance: Monaco, files: Record<SiteSourceFile, string>, active: SiteSourceFile) {
  for (const file of SOURCE_FILES) {
    const uri = monacoInstance.Uri.parse(`file:///${file}`);
    const existing = monacoInstance.editor.getModel(uri);
    if (!existing) {
      monacoInstance.editor.createModel(files[file], FILE_META[file].language, uri);
      continue;
    }
    if (file === active) continue;
    if (existing.getValue() !== files[file]) existing.setValue(files[file]);
  }
}

export const SiteCodeEditor = forwardRef<SiteCodeEditorHandle, SiteCodeEditorProps>(function SiteCodeEditor({ siteId, reloadToken = 0, onSiteUpdated, review = null }, ref) {
  const [selected, setSelected] = useState<SiteSourceFile>("app.tsx");
  const [drafts, setDrafts] = useState<Record<SiteSourceFile, string> | null>(null);
  const [saved, setSaved] = useState<Record<SiteSourceFile, string> | null>(null);
  const [prod, setProd] = useState<Record<SiteSourceFile, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadedOnceRef = useRef(false);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const prodRef = useRef(prod);
  prodRef.current = prod;
  const monacoRef = useRef<Monaco | null>(null);

  const loadFiles = useCallback(async () => {
    const [res, prodRes] = await Promise.all([sitesApi.getFiles(siteId, "draft"), sitesApi.getFiles(siteId, "prod").catch(() => null)]);
    const current = draftsRef.current;
    const prevSaved = savedRef.current;
    const nextSaved = res.files;
    const nextDrafts = { ...nextSaved };
    if (current && prevSaved) {
      for (const file of SOURCE_FILES) {
        if (current[file] !== prevSaved[file]) nextDrafts[file] = current[file];
      }
    }
    setSaved(nextSaved);
    setDrafts(nextDrafts);
    if (prodRes) setProd(prodRes.files);
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    if (!loadedOnceRef.current) setLoading(true);
    void loadFiles()
      .catch((err: unknown) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : "Failed to load files");
      })
      .finally(() => {
        if (cancelled) return;
        loadedOnceRef.current = true;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadFiles, reloadToken]);

  const dirtyFiles = useMemo(() => {
    const set = new Set<SiteSourceFile>();
    if (!drafts || !saved) return set;
    for (const file of SOURCE_FILES) {
      if (drafts[file] !== saved[file]) set.add(file);
    }
    return set;
  }, [drafts, saved]);

  const changedVsProd = useMemo(() => {
    const list: SiteSourceFile[] = [];
    if (!drafts || !prod) return list;
    for (const file of SOURCE_FILES) {
      if (drafts[file] !== prod[file]) list.push(file);
    }
    return list;
  }, [drafts, prod]);

  const saveFiles = useCallback(
    async (files: SiteSourceFile[], opts?: { quiet?: boolean }) => {
      const current = draftsRef.current;
      const prevSaved = savedRef.current;
      if (!current || !prevSaved) return;
      const dirty = files.filter((file) => current[file] !== prevSaved[file]);
      if (dirty.length === 0) return;
      setSaving(true);
      try {
        let lastSite: Site | undefined;
        let depsInstalled = false;
        for (const file of dirty) {
          const res = await sitesApi.putFile(siteId, file, current[file], "draft");
          lastSite = res.site;
          depsInstalled = depsInstalled || Boolean(res.depsInstalled);
          setSaved((s) => (s ? { ...s, [file]: current[file] } : s));
        }
        if (depsInstalled) await loadFiles();
        if (lastSite) onSiteUpdated(lastSite);
        if (!opts?.quiet) message.success(dirty.includes("package.json") || depsInstalled ? "Saved — dependencies installed" : "Saved");
      } catch (err: unknown) {
        if (!opts?.quiet) message.error(err instanceof Error ? err.message : "Save failed");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [siteId, onSiteUpdated, loadFiles],
  );

  const handleSave = useCallback(() => {
    void saveFiles(SOURCE_FILES).catch(() => undefined);
  }, [saveFiles]);

  const handleReviewNext = useCallback(() => {
    if (changedVsProd.length === 0) return;
    const idx = changedVsProd.indexOf(selected);
    const next = idx === -1 ? changedVsProd[0] : changedVsProd[(idx + 1) % changedVsProd.length];
    setSelected(next);
  }, [changedVsProd, selected]);

  const handleApproveReview = useCallback(() => {
    const file = selectedRef.current;
    void saveFiles([file], { quiet: true })
      .then(() => review?.onApprove(file))
      .then(() => {
        const content = draftsRef.current?.[file];
        if (content === undefined) return;
        setProd((p) => (p ? { ...p, [file]: content } : p));
      })
      .catch(() => undefined);
  }, [review, saveFiles]);

  const handleDiscardReview = useCallback(() => {
    const file = selectedRef.current;
    const previousDraft = draftsRef.current?.[file];
    const previousSaved = savedRef.current?.[file];
    const prodContent = prodRef.current?.[file];
    if (prodContent !== undefined) {
      setDrafts((d) => (d ? { ...d, [file]: prodContent } : d));
      setSaved((s) => (s ? { ...s, [file]: prodContent } : s));
      const monacoInstance = monacoRef.current;
      if (monacoInstance) {
        const existing = monacoInstance.editor.getModel(monacoInstance.Uri.parse(`file:///${file}`));
        if (existing && existing.getValue() !== prodContent) existing.setValue(prodContent);
      }
    }
    void Promise.resolve(review?.onDiscard(file)).catch(() => {
      if (previousDraft === undefined || previousSaved === undefined) return;
      setDrafts((d) => (d ? { ...d, [file]: previousDraft } : d));
      setSaved((s) => (s ? { ...s, [file]: previousSaved } : s));
      const monacoInstance = monacoRef.current;
      if (monacoInstance) {
        const existing = monacoInstance.editor.getModel(monacoInstance.Uri.parse(`file:///${file}`));
        if (existing && existing.getValue() !== previousDraft) existing.setValue(previousDraft);
      }
    });
  }, [review]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async (opts) => {
        await saveFiles(SOURCE_FILES, opts);
      },
    }),
    [saveFiles],
  );

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance || !drafts) return;
    syncInactiveSiteModels(monacoInstance, drafts, selected);
  }, [drafts, selected]);

  const handleEditorMount = useCallback((_editor: unknown, monacoInstance: Monaco) => {
    monacoRef.current = monacoInstance;
    const files = draftsRef.current;
    if (files) syncInactiveSiteModels(monacoInstance, files, selectedRef.current);
  }, []);

  const isDirty = dirtyFiles.size > 0;
  const meta = FILE_META[selected];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card md:border-r md:border-border">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30">
        {SOURCE_FILES.map((file) => {
          const item = FILE_META[file];
          const FileIcon = item.icon;
          const active = selected === file;
          return (
            <button key={file} type="button" onClick={() => setSelected(file)} className={cn("flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-left transition-colors", active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
              <FileIcon size={13} className="shrink-0 opacity-80" />
              <span className="font-mono text-[12px] font-medium">{file}</span>
              {dirtyFiles.has(file) || changedVsProd.includes(file) ? <span className="size-1.5 shrink-0 rounded-full bg-brand-soft" /> : null}
            </button>
          );
        })}
      </div>

      <div className="monaco-scroll-pad-x relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {loading || !drafts ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading files…</div>
        ) : (
          <MonacoEditor path={`file:///${selected}`} language={meta.language} value={drafts[selected]} keepCurrentModel onChange={(v) => setDrafts((d) => (d ? { ...d, [selected]: v ?? "" } : d))} onSave={handleSave} onMount={handleEditorMount} height="100%" options={{ fontSize: 13, tabSize: 2 }} />
        )}

        <AnimatePresence>
          {isDirty || (review && changedVsProd.length > 0) ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
              {isDirty ? (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                  <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-soft" />
                  <span className="mr-1 text-xs font-medium tracking-wide text-brand-soft">Unsaved</span>
                  <Button size="small" type="primary" icon={!saving ? <DisketteIcon size={14} /> : undefined} loading={saving} onClick={handleSave}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              ) : null}
              {review && changedVsProd.length > 0 ? (
                <DraftReviewBar
                  changedFiles={changedVsProd}
                  currentFile={selected}
                  onReviewNext={handleReviewNext}
                  onApprove={handleApproveReview}
                  onDiscard={handleDiscardReview}
                  approving={review.approving}
                  discarding={review.discarding}
                  discardConfirm={{
                    title: `Discard ${selected}?`,
                    description: "Reset this file to the production version. Other draft files are kept.",
                  }}
                  approveConfirm={{
                    title: `Approve ${selected}?`,
                    description: "Publish this file to production. Other draft files stay unpublished.",
                  }}
                />
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
});
