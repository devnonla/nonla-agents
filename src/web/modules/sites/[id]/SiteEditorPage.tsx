import { Button, Dropdown, EFormItemType, Input, Modal, Popover, SchemaForm, Segmented, Switch, type TFormItemProps, message } from "@nonla-agents/ui";
import type { MenuProps } from "@nonla-agents/ui";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { CodeSquareIcon } from "@solar-icons/react/dynamic/code-square";
import { EyeIcon } from "@solar-icons/react/dynamic/eye";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { LinkIcon } from "@solar-icons/react/dynamic/link";
import { LockIcon } from "@solar-icons/react/dynamic/lock";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { RefreshIcon } from "@solar-icons/react/dynamic/refresh";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import type { Site, SiteSourceFile } from "src/common/types";
import { normalizeSlugInput, slugify } from "src/common/utils/slug";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import RenderIf from "src/components/RenderIf";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { capturePreviewIframe } from "../common/capturePreviewIframe";
import { sitesApi } from "../common/sitesApi";
import { SiteAgentPanel } from "../components/SiteAgentPanel";
import { SiteCodeEditor, type SiteCodeEditorHandle } from "./components/SiteCodeEditor";

type SiteViewMode = "preview" | "editor";

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

function SiteViewToggle({ value, onChange }: { value: SiteViewMode; onChange: (v: SiteViewMode) => void }) {
  return (
    <Segmented
      size="small"
      value={value}
      onChange={onChange}
      options={[
        {
          value: "preview",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <EyeIcon size={14} />
              Preview
            </span>
          ),
        },
        {
          value: "editor",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <CodeSquareIcon size={14} />
              Editor
            </span>
          ),
        },
      ]}
    />
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
          <LockIcon size={11} className="shrink-0 text-muted-foreground" />
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
  const [providerId, setProviderId] = useState<string | undefined>();
  const [model, setModel] = useState("");
  const [panelResizing, setPanelResizing] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentGenerating, setAgentGenerating] = useState(false);
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

  useEffect(() => {
    void getSettingValues([SettingKey.SiteAssistantProvider, SettingKey.SiteAssistantModel]).then((s) => {
      setProviderId(s[SettingKey.SiteAssistantProvider] || undefined);
      setModel(s[SettingKey.SiteAssistantModel] ?? "");
    });
  }, []);

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

  const onToolAction = (event: ToolActionEvent) => {
    if (event.type !== "tool-result") return;
    if (event.toolName === "edit_ui" || event.toolName === "edit_styles" || event.toolName === "edit_backend") {
      void reload();
      schedulePreviewReload();
      setFilesEpoch((n) => n + 1);
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
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
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

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: "Edit name",
      icon: <PenNewSquareIcon size={14} />,
      onClick: () => setSettingsOpen(true),
    },
    { type: "divider" },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      icon: <TrashBinMinimalisticIcon size={14} />,
      onClick: handleDelete,
    },
  ];

  const publicAccessControl = (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <div className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 p-1">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3">
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
                <LinkIcon size={14} className="shrink-0 text-primary" />
                <a href={publicLink} target="_blank" rel="noreferrer" className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-primary no-underline">
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
      <Button size="small" icon={site.isPublished ? hasPassword ? <LockIcon size={14} className="text-success" /> : <GlobalIcon size={14} className="text-success" /> : <GlobalIcon size={14} className="text-muted-foreground" />}>
        <span className={site.isPublished ? "text-success" : "text-muted-foreground"}>{site.isPublished ? "Published" : "Unpublished"}</span>
      </Button>
    </Popover>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link to="/sites" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to sites">
          <AltArrowLeftIcon size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="m-0 mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Site editor</p>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{site.name}</h1>
            <RenderIf condition={!!site.draftDirty}>
              <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-soft">Draft changes</span>
            </RenderIf>
          </div>
        </div>
        <SiteViewToggle value={viewMode} onChange={(v) => void handleViewModeChange(v)} />
        <div className="flex items-center">
          <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
            <Button type="text" icon={<MenuDotsIcon size={16} weight="Bold" />} aria-label="Site menu" />
          </Dropdown>
        </div>
      </header>

      <RenderIf condition={settingsOpen}>
        <SiteSettingsModal site={site} onClose={() => setSettingsOpen(false)} onSaved={setSite} />
      </RenderIf>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {viewMode === "preview" ? (
            <BrowserChrome
              url={previewLabel}
              className="rounded-none border-0 md:border-r md:border-border"
              trailing={
                <div className="flex shrink-0 items-center gap-0.5">
                  {publicAccessControl}
                  <Button size="small" type="text" loading={previewLoading} icon={<RefreshIcon size={14} />} onClick={runPreview} aria-label="Refresh preview" />
                </div>
              }
            >
              <div className="relative flex min-h-0 flex-1 flex-col">
                <iframe ref={previewIframeRef} key={previewEpoch} title="preview" className="min-h-0 flex-1 w-full bg-white" style={{ pointerEvents: panelResizing ? "none" : undefined }} src={previewSrc} onLoad={onPreviewLoad} />
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

        <SiteAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/sites/${site.id}/agent/stream`}
          onToolAction={onToolAction}
          onModelChange={(pid, m) => {
            setProviderId(pid);
            setModel(m);
            void apiClient.patch("/api/settings", {
              [SettingKey.SiteAssistantProvider]: pid,
              [SettingKey.SiteAssistantModel]: m,
            });
          }}
          onResizeDraggingChange={setPanelResizing}
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
      </div>
    </div>
  );
}
