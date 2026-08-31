// ─── Edit Tool Page ───────────────────────────────────────────────────────────
// Route: /tools/:id — Full-page editor for a single tool.
// Layout: Header → [ Editor | CodingAgentPanel(right) ]
// Name, description, and params live in the code annotation header.

import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";
import { SettingKey } from "src/common/enum";
import type { AgentTool } from "src/common/types";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import type { ToolActionEvent } from "./components/CodingAgentPanel";

import { deleteTool, fetchTools, updateTool } from "../common/toolsSlice";
import { injectMetaIntoCode, injectParamsIntoCode, parseMetaFromCode, parseParams, sameSourceBody, syncAnnotationHeader } from "../common/utils";

import { CodingAgentPanel } from "./components/CodingAgentPanel";
import { EditToolHeader } from "./components/EditToolHeader";
import { ValidationBanner } from "./components/ValidationBanner";

export default function EditToolPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // ── Fetch tool ──
  const [tool, setTool] = useState<AgentTool | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setTool(undefined);
    setLoading(true);
    apiClient
      .get<AgentTool>(`/api/tools/${id}`)
      .then((tool) => setTool(tool))
      .catch(() => setTool(undefined))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Code state ──
  const [localCode, setLocalCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const codeRef = useRef(localCode);
  codeRef.current = localCode;
  const savedCodeRef = useRef(savedCode);
  savedCodeRef.current = savedCode;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const currentLoadedToolIdRef = useRef<string | null>(null);

  // ── Load code when tool is fetched ──
  useEffect(() => {
    if (!tool || currentLoadedToolIdRef.current === tool.id) return;
    let code = injectParamsIntoCode(tool.codeContent ?? "", parseParams(tool));
    code = injectMetaIntoCode(code, {
      label: tool.label,
      description: tool.description,
    });
    setLocalCode(code);
    setSavedCode(code);
    currentLoadedToolIdRef.current = tool.id;

    // If there's a pending AI draft that differs from saved code, show diff.
    // Compare source bodies — published code always has synced @name/@param headers,
    // while AI drafts often omit them. Header-only mismatch is not a real draft.
    if (tool.draftCode) {
      let draft = injectParamsIntoCode(tool.draftCode, parseParams(tool));
      draft = injectMetaIntoCode(draft, {
        label: tool.label,
        description: tool.description,
      });
      if (!sameSourceBody(draft, code)) {
        setCodeDraft(draft);
      } else {
        setCodeDraft(null);
      }
    } else {
      setCodeDraft(null);
    }
  }, [tool]);

  // ── Listen for WS tools:updated — sync draftCode from AI / other tabs ──
  useEffect(() => {
    if (!id) return;
    const unsub = wsClient.on<Partial<AgentTool> & { id: string }>("tools:updated", (payload) => {
      if (payload.id !== id) return;

      if (payload.label !== undefined || payload.name !== undefined || payload.description !== undefined || payload.parameters !== undefined) {
        setTool((prev) =>
          prev
            ? {
                ...prev,
                ...(payload.label !== undefined ? { label: payload.label } : {}),
                ...(payload.name !== undefined ? { name: payload.name } : {}),
                ...(payload.description !== undefined ? { description: payload.description } : {}),
                ...(payload.parameters !== undefined ? { parameters: payload.parameters } : {}),
              }
            : prev,
        );
      }

      // Sync published code when it actually changed (this tab's code save, or another tab).
      // Spec-only updates also send codeContent — ignore it if it matches the last saved code
      // so unsaved editor edits are not wiped.
      if ("codeContent" in payload && payload.codeContent != null && payload.codeContent !== savedCodeRef.current) {
        const code = payload.codeContent;
        setSavedCode(code);
        setLocalCode(code);
        setCodeDraft((prev) => (prev !== null && prev === code ? null : prev));
      } else if (payload.label != null || payload.description != null || payload.parameters != null) {
        const current = toolRef.current;
        const code = codeRef.current;
        const next = syncAnnotationHeader(code, {
          label: payload.label ?? current?.label,
          description: payload.description ?? current?.description,
          parameters: payload.parameters ?? current?.parameters,
        });
        if (next !== code) {
          setLocalCode(next);
          if (code === savedCodeRef.current) setSavedCode(next);
        }
      }

      // Only show diff when the draft source body differs from published code
      if ("draftCode" in payload) {
        const draft = payload.draftCode;
        const code = payload.codeContent ?? codeRef.current;
        if (draft == null || sameSourceBody(draft, code)) {
          setCodeDraft(null);
        } else {
          const current = toolRef.current;
          if (current) {
            let shown = injectParamsIntoCode(draft, parseParams(current));
            shown = injectMetaIntoCode(shown, { label: current.label, description: current.description });
            setCodeDraft(shown);
          } else {
            setCodeDraft(draft);
          }
        }
      }
    });
    return unsub;
  }, [id]);

  // ── Save + delete state ──
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDirty = localCode !== savedCode;

  // ── Annotation validation ──
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

  // ── Provider / model (persisted) ──
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    getSettingValues([SettingKey.ToolAssistantProvider, SettingKey.ToolAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.ToolAssistantProvider] ?? "";
      const savedModel = s[SettingKey.ToolAssistantModel] ?? "";
      const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
      setProviderId(match.id);
      setModel(savedModel);
    });
  }, [providersLoaded, providerItems]);

  // ── Handle tool actions from AI ──
  const handleToolAction = useCallback((event: ToolActionEvent) => {
    if (event.toolName !== "edit_code" || event.type !== "tool-result") return;
    // Primary path: WS tools:updated carries full draftCode.
    // Fallback: tool-result current_code if WS was missed.
    let out: { ok?: boolean; current_code?: string } | null = null;
    if (typeof event.output === "string") {
      try {
        out = JSON.parse(event.output) as { ok?: boolean; current_code?: string };
      } catch {
        out = null;
      }
    } else if (event.output && typeof event.output === "object") {
      out = event.output as { ok?: boolean; current_code?: string };
    }
    if (out?.ok && typeof out.current_code === "string" && !sameSourceBody(out.current_code, codeRef.current)) {
      setCodeDraft(out.current_code);
    }
  }, []);

  // ── Active toggle ──
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

  // ── Save ──
  const [saveError, setSaveError] = useState<string | null>(null);
  const handleSave = async (codeOverride?: string) => {
    if (!id) return;
    const code = codeOverride ?? localCode;
    if (!codeOverride && !isDirty) return;
    // Annotations in the editor are source of truth — block save locally when missing.
    if (!codeOverride && hasValidationErrors) {
      setShowValidationError(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Server validates codeContent and auto-derives parameters, label, name, description
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
    } catch (err: any) {
      const msg = typeof err === "string" ? err : (err?.message ?? "Failed to save");
      setSaveError(msg);
      setShowValidationError(true);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
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

  // ── Loading / Not found states ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground font-medium">Loading tool…</span>
        </div>
      </div>
    );
  }

  if (!loading && id && !tool) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
            <ProgrammingIcon size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Tool not found</p>
            <p className="text-xs text-muted-foreground">This tool may have been deleted.</p>
          </div>
          <button type="button" onClick={() => navigate("/tools")} className="text-xs font-semibold text-primary hover:text-primary cursor-pointer bg-transparent border-0 underline underline-offset-2">
            Back to Tools
          </button>
        </div>
      </div>
    );
  }

  if (!tool) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top bar */}
      <EditToolHeader label={toolLabel} toolId={id} icon={tool?.icon} isActive={isActive} toggling={toggling} deleting={deleting} onToggleActive={handleToggleActive} onDelete={handleDelete} onIconChange={handleIconChange} />

      {/* Body: Editor | CodingAgentPanel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative bg-background">
          {showValidationError && (saveError || hasValidationErrors) && (
            <ValidationBanner
              errors={saveError ? [saveError] : codeValidationErrors}
              onDismiss={() => {
                setShowValidationError(false);
                setSaveError(null);
              }}
            />
          )}

          {/* Monaco editor — diff mode when AI draft exists */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {codeDraft !== null && codeDraft !== localCode ? (
              <>
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
                <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
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
                </div>
              </>
            ) : (
              <>
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
                    onSave={() => handleSave()}
                    options={{ fontSize: 13, tabSize: 2 }}
                  />
                </div>
                {isDirty && (
                  <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
                    <DraftReviewBar
                      approving={saving}
                      onApprove={() => void handleSave()}
                      onDiscard={() => setLocalCode(savedCode)}
                      discardConfirm={{
                        title: "Discard changes?",
                        description: "Reset the editor to the last saved version. Unsaved edits will be lost.",
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: AI Chat */}
        <CodingAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/tools/${id}/coding/stream`}
          onToolAction={handleToolAction}
          onModelChange={(pid, m) => {
            setProviderId(pid);
            setModel(m);
            void apiClient.patch("/api/settings", {
              [SettingKey.ToolAssistantProvider]: pid,
              [SettingKey.ToolAssistantModel]: m,
            });
          }}
        />
      </div>
    </div>
  );
}
