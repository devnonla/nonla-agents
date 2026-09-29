import { Button, EFormItemType, FluentIcon, Input, Modal, Popover, SchemaForm, Switch, type TFormItemProps, message } from "devnonla-ui";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import type { Site, SiteSourceFile } from "src/common/types";
import { normalizeSlugInput, slugify } from "src/common/utils/slug";
import { AgentSidePanel } from "src/components/AgentSidePanel";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import RenderIf from "src/components/RenderIf";
import { capturePreviewIframe } from "../common/capturePreviewIframe";
import { sitesApi } from "../common/sitesApi";
import { SiteAgentPanel } from "./components/SiteAgentPanel";
import { SiteCodeEditor, type SiteCodeEditorHandle } from "./components/SiteCodeEditor";
import { SiteEditorHeader, type SiteViewMode } from "./components/SiteEditorHeader";

type SiteSettingsValues = { name: string; slug: string };

const SITE_SETTINGS_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
  },
  {
    type: EFormItemType.Input,
    name: "slug",
    label: "Slug",
    colSpan: 12,
    rules: {
      required: "Slug is required",
      pattern: { value: "^[a-z0-9]+(?:-[a-z0-9]+)*$", message: "Slug must be lowercase alphanumeric with hyphens" },
    },
  },
];

function SiteSettingsModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (site: Site) => void;
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm<SiteSettingsValues>({ defaultValues: { name: site.name, slug: site.slug }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  const onSubmit = form.handleSubmit(async ({ name, slug }) => {
    const n = name.trim();
    const s = slugify(slug);
    setSaving(true);
    try {
      const updated = await sitesApi.update(site.id, { name: n, slug: s });
      message.success("Site updated");
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title="Site settings" onCancel={onClose} onOk={() => void onSubmit()} okText="Save" confirmLoading={saving} destroyOnHidden>
      <form onSubmit={onSubmit}>
        <SchemaForm
          form={form}
          items={SITE_SETTINGS_ITEMS}
          valuesChangeDebounce={0}
          onValuesChange={(all) => {
            const normalized = normalizeSlugInput(all.slug);
            if (normalized !== all.slug) form.setValue("slug", normalized);
          }}
        />
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">Public URL: /public/sites/{"{slug}"}</p>
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}

function BrowserChrome({
  url,
  trailing,
  children,
  className,
}: {
  url: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-card ${className ?? "rounded-xl border border-border"}`}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1">
          <FluentIcon name="lock-closed-24" size={11} className="shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[12px] leading-none text-tertiary-foreground">{url}</span>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export default function SiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentGenerating, setAgentGenerating] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [previewAuthReady, setPreviewAuthReady] = useState(false);
  const [viewMode, setViewMode] = useState<SiteViewMode>("preview");
  const [filesEpoch, setFilesEpoch] = useState(0);
  const codeEditorRef = useRef<SiteCodeEditorHandle>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const s = await sitesApi.get(id);
    setSite(s);
    setLocalPassword("");
    setPasswordTouched(false);
  }, [id]);

  const mintPreviewSession = useCallback(async () => {
    if (!id) return;
    await apiClient.post(`/api/sites/${id}/live/session`, {});
  }, [id]);

  const runPreview = useCallback(() => {
    setPreviewLoading(true);
    void mintPreviewSession()
      .catch(() => undefined)
      .finally(() => setPreviewEpoch((n) => n + 1));
  }, [mintPreviewSession]);

  const schedulePreviewReload = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      runPreview();
    }, 700);
  }, [runPreview]);

  const captureAndUploadThumbnail = useCallback(async () => {
    if (!id) return;
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    try {
      const blob = await capturePreviewIframe(iframe);
      if (!blob) return;
      await sitesApi.uploadThumbnail(id, blob);
    } catch {
      /* ignore capture failures — list falls back to icon */
    }
  }, [id]);

  const onPreviewLoad = useCallback(() => {
    setPreviewLoading(false);
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(() => {
      thumbTimerRef.current = null;
      void captureAndUploadThumbnail();
    }, 400);
  }, [captureAndUploadThumbnail]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPreviewAuthReady(false);
    void mintPreviewSession()
      .then(() => {
        if (!cancelled) setPreviewAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setPreviewAuthReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mintPreviewSession]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void reload()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        message.error(err instanceof Error ? err.message : "Failed to load site");
        navigate("/sites");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate, reload]);

  const applyServerState = useCallback(
    (s: Site) => {
      setSite(s);
      schedulePreviewReload();
      setFilesEpoch((n) => n + 1);
    },
    [schedulePreviewReload],
  );

  const handleApprove = async (file?: SiteSourceFile) => {
    if (!id) return;
    setApproving(true);
    try {
      const s = await sitesApi.approve(id, file);
      setSite(s);
      message.success(file ? `${file} approved → production` : "Draft approved → production");
      runPreview();
      setFilesEpoch((n) => n + 1);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Approve failed");
      throw err;
    } finally {
      setApproving(false);
    }
  };

  const handleDiscard = async (file?: SiteSourceFile) => {
    if (!id) return;
    setDiscarding(true);
    try {
      const s = await sitesApi.discard(id, file);
      setSite(s);
      message.success(file ? `${file} discarded` : "Draft discarded");
      runPreview();
      setFilesEpoch((n) => n + 1);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Discard failed");
      throw err;
    } finally {
      setDiscarding(false);
    }
  };

  const handleViewModeChange = async (next: SiteViewMode) => {
    if (next === viewMode) return;
    if (viewMode === "editor") {
      try {
        await codeEditorRef.current?.flush();
      } catch {
        return;
      }
      runPreview();
    }
    setViewMode(next);
  };

  if (loading || !site) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const publicPath = `/public/sites/${site.slug}`;
  const publicLink = `${window.location.origin}${publicPath}`;
  const previewLabel = site.isPublished ? publicLink : "Draft preview";
  const previewSrc = previewAuthReady ? `/api/sites/${id}/live?t=${previewEpoch}` : undefined;
  const passwordDirty = passwordTouched;
  const hasPassword = !!site.hasPublicPassword;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      message.success("Public link copied");
    } catch {
      message.error("Copy failed");
    }
  };

  const handleSavePassword = async () => {
    setSavingPassword(true);
    try {
      const updated = await sitesApi.update(site.id, { publicPassword: localPassword || null });
      setSite(updated);
      setLocalPassword("");
      setPasswordTouched(false);
      message.success(localPassword ? "Password saved" : "Password removed");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to save password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: `Delete "${site.name}"?`,
      content: "This cannot be undone. Draft and production files will be removed.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        await sitesApi.remove(site.id);
        message.success("Site deleted");
        navigate("/sites");
      },
    });
  };

  const publicAccessControl = (
    <Popover
      trigger="click"
      placement="bottomRight"
      contentClassName="w-80 p-3"
      content={
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-foreground">Public access</p>
              <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">{site.isPublished ? "Anyone with the link can view this site." : "Publish this site to make it available at a public URL."}</p>
            </div>
            <Switch
              size="small"
              checked={site.isPublished}
              onChange={async (checked) => {
                const updated = await sitesApi.update(site.id, { isPublished: checked });
                setSite(updated);
              }}
            />
          </div>
          <RenderIf condition={site.isPublished}>
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live URL</span>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2">
                <FluentIcon name="link-24" size={14} className="shrink-0 text-primary" />
                <a href={publicLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-primary no-underline">
                  {publicLink}
                </a>
                <Button size="small" onClick={() => void handleCopyLink()} className="shrink-0">
                  Copy
                </Button>
              </div>
            </div>
          </RenderIf>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">Password protection</span>
              <span className={hasPassword ? "rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success" : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>{hasPassword ? "Enabled" : "Off"}</span>
            </div>
            <Input.Password
              className="mt-3"
              visibilityToggle={{ visible: showPassword, onVisibleChange: setShowPassword }}
              placeholder={hasPassword ? "Password is set — type to change" : "Leave blank for open access"}
              value={localPassword}
              onChange={(e) => {
                setLocalPassword(e.target.value);
                setPasswordTouched(true);
              }}
            />
            <p className="m-0 mt-2 text-[11px] leading-4 text-muted-foreground">{hasPassword ? "Clear the field and save to remove password protection." : "Visitors must enter this password to view the public site."}</p>
            <div className="mt-3 flex justify-end">
              <Button size="small" type="primary" disabled={!passwordDirty} loading={savingPassword} onClick={() => void handleSavePassword()}>
                Save password
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <Button size="small" icon={<FluentIcon name={site.isPublished ? (hasPassword ? "globe-shield-24" : "globe-24") : "cloud-dismiss-24"} size={16} />}>
        <span className={site.isPublished ? "text-success" : "text-muted-foreground"}>{site.isPublished ? "Published" : "Unpublished"}</span>
      </Button>
    </Popover>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <SiteEditorHeader title={site.name} draftDirty={!!site.draftDirty} viewMode={viewMode} onViewModeChange={(v) => void handleViewModeChange(v)} onEditName={() => setSettingsOpen(true)} onDelete={handleDelete} agentOpen={agentOpen} onToggleAgent={() => setAgentOpen((v) => !v)} />

      <RenderIf condition={settingsOpen}>
        <SiteSettingsModal site={site} onClose={() => setSettingsOpen(false)} onSaved={setSite} />
      </RenderIf>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex h-full min-h-0 min-w-0 flex-col">
            {viewMode === "preview" ? (
              <BrowserChrome
                url={previewLabel}
                className="rounded-none border-0"
                trailing={
                  <div className="flex shrink-0 items-center gap-0.5">
                    {publicAccessControl}
                    <Button size="small" type="text" loading={previewLoading} icon={<RefreshCw size={14} />} onClick={runPreview} aria-label="Refresh preview" />
                  </div>
                }
              >
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <iframe ref={previewIframeRef} key={previewEpoch} title="preview" className="min-h-0 w-full flex-1 bg-white" src={previewSrc} onLoad={onPreviewLoad} />
                  <RenderIf condition={previewLoading}>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground backdrop-blur-[1px]">Loading preview…</div>
                  </RenderIf>
                  {site.draftDirty && !agentGenerating ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
                      <div className="pointer-events-auto">
                        <DraftReviewBar
                          changedFiles={["app.tsx"]}
                          onApprove={() => void handleApprove().catch(() => undefined)}
                          onDiscard={() => void handleDiscard().catch(() => undefined)}
                          approving={approving}
                          discarding={discarding}
                          discardConfirm={{
                            title: "Discard draft?",
                            description: "Reset draft to production. Unpublished changes will be lost.",
                          }}
                          approveConfirm={{
                            title: "Approve draft?",
                            description: "Publish draft to production. This replaces the current live site.",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </BrowserChrome>
            ) : (
              <SiteCodeEditor
                ref={codeEditorRef}
                siteId={site.id}
                reloadToken={filesEpoch}
                onSiteUpdated={setSite}
                review={
                  site.draftDirty && !agentGenerating
                    ? {
                        onApprove: (file) => handleApprove(file),
                        onDiscard: (file) => handleDiscard(file),
                        approving,
                        discarding,
                      }
                    : null
                }
              />
            )}
          </div>
        </div>

        <AgentSidePanel open={agentOpen}>
          <SiteAgentPanel
            siteId={site.id}
            onServerSync={applyServerState}
            onGeneratingChange={setAgentGenerating}
            onBeforeSend={async () => {
              if (viewMode !== "editor") return;
              try {
                await codeEditorRef.current?.flush({ quiet: true });
              } catch {
                /* still send so the agent can fix unsaved editor errors */
              }
            }}
          />
        </AgentSidePanel>
      </div>
    </div>
  );
}
