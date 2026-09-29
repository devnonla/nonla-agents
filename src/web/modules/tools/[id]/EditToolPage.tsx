import { FluentIcon } from "devnonla-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";
import type { AgentTool } from "src/common/types";
import { AgentSidePanel } from "src/components/AgentSidePanel";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import { useAppDispatch } from "src/store/store";
import { deleteTool, fetchTools, updateTool } from "../common/toolsSlice";
import { injectMetaIntoCode, injectParamsIntoCode, parseMetaFromCode, parseParams, sameSourceBody } from "../common/utils";
import { EditToolHeader } from "./components/EditToolHeader";
import { ToolAgentPanel } from "./components/ToolAgentPanel";
import { ValidationBanner } from "./components/ValidationBanner";

function displayToolCode(tool: AgentTool, source: string): string {
  const code = injectParamsIntoCode(source, parseParams(tool));
  return injectMetaIntoCode(code, { label: tool.label, description: tool.description });
}

function pendingCodeDraft(tool: AgentTool, published: string): string | null {
  if (tool.draftCode == null || tool.draftCode === "") return null;
  const draft = displayToolCode(tool, tool.draftCode);
  return sameSourceBody(draft, published) ? null : draft;
}

export default function EditToolPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [tool, setTool] = useState<AgentTool | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [localCode, setLocalCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [agentGenerating, setAgentGenerating] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const editorRef = useRef<EditorInstance | null>(null);
  const codeRef = useRef(localCode);
  codeRef.current = localCode;
  const savedCodeRef = useRef(savedCode);
  savedCodeRef.current = savedCode;

  const applyServerState = useCallback((t: AgentTool) => {
    setTool(t);
    const published = displayToolCode(t, t.codeContent ?? "");
    const localWasClean = codeRef.current === savedCodeRef.current;
    setSavedCode(published);
    if (localWasClean) setLocalCode(published);
    setCodeDraft(pendingCodeDraft(t, published));
  }, []);

  useEffect(() => {
    if (!id) return;
    setTool(undefined);
    setLoading(true);
    apiClient
      .get<AgentTool>(`/api/tools/${id}`)
      .then((next) => applyServerState(next))
      .catch(() => setTool(undefined))
      .finally(() => setLoading(false));
  }, [id, applyServerState]);

  useEffect(() => {
    if (!id) return;
    const unsub = wsClient.on<Partial<AgentTool> & { id: string }>("tools:updated", (payload) => {
      if (payload.id !== id) return;
      void apiClient
        .get<AgentTool>(`/api/tools/${id}`)
        .then(applyServerState)
        .catch(() => {});
    });
    return unsub;
  }, [id, applyServerState]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDirty = localCode !== savedCode;

  const codeMeta = useMemo(() => parseMetaFromCode(localCode), [localCode]);
  const hasExportDefault = useMemo(() => /export\s+default\b/.test(localCode), [localCode]);
  const codeValidationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!codeMeta.label) errors.push("name");
    if (!codeMeta.description) errors.push("description");
    const codeLines = localCode.split("\n").filter((l) => {
      const t = l.trim();
      return t && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*");
    });
    if (codeLines.length === 0) errors.push("code body");
    if (!hasExportDefault) errors.push("export default");
    return errors;
  }, [codeMeta, localCode, hasExportDefault]);
  const hasValidationErrors = codeValidationErrors.length > 0;
  const [showValidationError, setShowValidationError] = useState(false);

  useEffect(() => {
    if (!hasValidationErrors) setShowValidationError(false);
  }, [hasValidationErrors]);

  const isActive = tool?.isActive ?? false;
  const [toggling, setToggling] = useState(false);

  const handleToggleActive = useCallback(async () => {
    if (!id || toggling) return;
    if (!isActive && hasValidationErrors) {
      setShowValidationError(true);
      return;
    }
    setToggling(true);
    try {
      await dispatch(updateTool({ id, isActive: !isActive })).unwrap();
      setTool((prev) => (prev ? { ...prev, isActive: !isActive } : prev));
    } finally {
      setToggling(false);
    }
  }, [id, isActive, toggling, dispatch, hasValidationErrors]);

  const handleIconChange = useCallback(
    async (nextIcon: string | null) => {
      if (!id) return;
      await dispatch(updateTool({ id, icon: nextIcon })).unwrap();
      setTool((prev) => (prev ? { ...prev, icon: nextIcon ?? undefined } : prev));
    },
    [id, dispatch],
  );

  const [saveError, setSaveError] = useState<string | null>(null);
  const handleSave = async (codeOverride?: string, opts?: { quiet?: boolean }): Promise<boolean> => {
    if (!id) return false;
    const code = codeOverride ?? localCode;
    if (!codeOverride && !isDirty) return true;
    if (!codeOverride && hasValidationErrors) {
      if (!opts?.quiet) setShowValidationError(true);
      return false;
    }
    setSaving(true);
    if (!opts?.quiet) setSaveError(null);
    try {
      const updated = await dispatch(
        updateTool({
          id,
          codeContent: code,
          draftCode: code,
        }),
      ).unwrap();
      const saved = typeof updated?.codeContent === "string" ? updated.codeContent : code;
      setLocalCode(saved);
      setSavedCode(saved);
      setCodeDraft(null);
      const meta = parseMetaFromCode(saved);
      setTool((prev) =>
        prev
          ? {
              ...prev,
              ...(meta.label ? { label: meta.label } : {}),
              ...(meta.description ? { description: meta.description } : {}),
            }
          : prev,
      );
      return true;
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to save";
      setSaveError(msg);
      setShowValidationError(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await dispatch(deleteTool(id)).unwrap();
      await dispatch(fetchTools());
      navigate("/tools");
    } finally {
      setDeleting(false);
    }
  }, [id, deleting, dispatch, navigate]);

  const toolLabel = tool?.label || parseMetaFromCode(localCode).label || "Untitled Tool";
  const showDiff = codeDraft !== null && codeDraft !== localCode;
  const reviewBar =
    !agentGenerating && showDiff ? (
      <DraftReviewBar
        approving={saving}
        onApprove={() => {
          const draft = codeDraft;
          if (!draft) return;
          setCodeDraft(null);
          setLocalCode(draft);
          void handleSave(draft);
        }}
        onDiscard={() => {
          setCodeDraft(null);
          if (id) void apiClient.put(`/api/tools/${id}`, { draftCode: savedCodeRef.current });
        }}
      />
    ) : !agentGenerating && isDirty ? (
      <DraftReviewBar
        approving={saving}
        onApprove={() => void handleSave()}
        onDiscard={() => setLocalCode(savedCode)}
        discardConfirm={{
          title: "Discard changes?",
          description: "Reset the editor to the last saved version. Unsaved edits will be lost.",
        }}
      />
    ) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span className="text-sm font-medium text-muted-foreground">Loading tool…</span>
        </div>
      </div>
    );
  }

  if (!loading && id && !tool) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FluentIcon name="code-24" size={22} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-foreground">Tool not found</p>
            <p className="text-xs text-muted-foreground">This tool may have been deleted.</p>
          </div>
          <button type="button" onClick={() => navigate("/tools")} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary">
            Back to Tools
          </button>
        </div>
      </div>
    );
  }

  if (!id || !tool) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <EditToolHeader label={toolLabel} toolId={id} icon={tool.icon} isActive={isActive} toggling={toggling} deleting={deleting} agentOpen={agentOpen} onToggleAgent={() => setAgentOpen((v) => !v)} onToggleActive={handleToggleActive} onDelete={handleDelete} onIconChange={handleIconChange} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {showValidationError && (saveError || hasValidationErrors) ? (
            <ValidationBanner
              errors={saveError ? [saveError] : codeValidationErrors}
              onDismiss={() => {
                setShowValidationError(false);
                setSaveError(null);
              }}
            />
          ) : null}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {showDiff && codeDraft != null ? (
              <div className="absolute inset-0">
                <MonacoDiffEditor
                  language="typescript"
                  original={localCode}
                  modified={codeDraft}
                  options={{ fontSize: 13, renderSideBySide: false, renderIndicators: false }}
                  onMount={(editor) => {
                    editor.getOriginalEditor().updateOptions({ lineNumbers: "off" });
                  }}
                />
              </div>
            ) : (
              <div className="absolute inset-0">
                <MonacoEditor
                  language="typescript"
                  value={localCode}
                  onChange={(v) => {
                    setLocalCode(v ?? "");
                  }}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  onSave={() => void handleSave()}
                  options={{ fontSize: 13, tabSize: 2 }}
                />
              </div>
            )}

            {reviewBar ? <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">{reviewBar}</div> : null}
          </div>
        </div>

        <AgentSidePanel open={agentOpen}>
          <ToolAgentPanel
            toolId={id}
            onServerSync={applyServerState}
            onGeneratingChange={setAgentGenerating}
            onBeforeSend={async () => {
              if (!isDirty) return;
              await handleSave(undefined, { quiet: true });
            }}
          />
        </AgentSidePanel>
      </div>
    </div>
  );
}
