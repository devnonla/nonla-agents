import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { Alert, Button, Form, Input, Modal, Segmented, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Site } from "src/common/types";
import { normalizeSlugInput, slugify } from "src/common/utils/slug";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSite, fetchSites } from "./common/sitesSlice";
import { SITE_VISIBILITY_META, SiteNameCell, SiteOpenPublicButton, type SiteVisibility, SiteVisibilityIcon, siteVisibility } from "./components/SiteCard";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type VisibilityFilter = "all" | SiteVisibility;

function CreateSiteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (site: Site) => void }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const handleSubmit = async () => {
    const n = name.trim();
    const s = slugify(slug);
    if (!n) {
      setError("Name is required");
      return;
    }
    if (!SLUG_RE.test(s)) {
      setError("Slug must be lowercase alphanumeric with hyphens");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const site = (await dispatch(createSite({ name: n, slug: s })).unwrap()) as Site;
      message.success("Site created");
      onCreated(site);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="New site" onCancel={onClose} onOk={handleSubmit} okText="Create" confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input
            autoFocus
            value={name}
            placeholder="News page"
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              if (!slug || slug === slugify(name)) {
                setSlug(slugify(v));
              }
            }}
          />
        </Form.Item>
        <Form.Item label="Slug" required extra="Public URL: /public/sites/{slug}">
          <Input value={slug} placeholder="news" onChange={(e) => setSlug(normalizeSlugInput(e.target.value))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function SitesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.sites.items) as Site[];
  const [loading, setLoading] = useState(items.length === 0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dispatch(fetchSites({ limit: 100, sorts: "-updatedAt" })).unwrap();
      } catch (err: unknown) {
        if (!cancelled) message.error(err instanceof Error ? err.message : "Failed to load sites");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const filtered = useMemo(() => {
    if (visibilityFilter === "all") return items;
    return items.filter((site) => siteVisibility(site) === visibilityFilter);
  }, [items, visibilityFilter]);

  const columns: ColumnsType<Site> = [
    {
      title: "",
      key: "visibility",
      width: 40,
      render: (_, site) => <SiteVisibilityIcon site={site} />,
    },
    {
      title: "Name",
      key: "name",
      render: (_, site) => <SiteNameCell site={site} onOpen={() => navigate(`/sites/${site.id}`)} />,
    },
    {
      title: "Path",
      key: "path",
      render: (_, site) => <span className="font-mono text-xs text-tertiary-foreground">/public/sites/{site.slug}</span>,
    },
    {
      title: "",
      key: "open",
      width: 88,
      align: "right",
      render: (_, site) => <SiteOpenPublicButton site={site} />,
    },
  ];

  return (
    <PageShell>
      <MissingProviderCallout />
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Sites</h1>
        <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialogOpen(true)}>
          New site
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand/12 text-brand-soft">
              <GlobalIcon size={28} weight="BoldDuotone" />
            </div>
            <p className="mb-1 text-base font-semibold text-foreground">No sites yet</p>
            <p className="m-0 mb-5 max-w-sm text-center text-sm text-muted-foreground">Create a page, refine the draft, then publish when it looks right.</p>
            <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialogOpen(true)}>
              New site
            </Button>
          </div>
        }
      >
        <div className="mb-3">
          <Segmented<VisibilityFilter>
            value={visibilityFilter}
            onChange={setVisibilityFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Public", value: "public" },
              { label: "Protected", value: "protected" },
              { label: "Unpublished", value: "unpublished" },
            ]}
          />
        </div>
        <Table<Site>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          loading={loading && items.length === 0}
          pagination={false}
          onRow={(site) => ({
            onClick: () => navigate(`/sites/${site.id}`),
            className: "cursor-pointer",
          })}
          locale={{
            emptyText: <div className="py-8 text-center text-sm text-muted-foreground">No {visibilityFilter === "all" ? "" : `${SITE_VISIBILITY_META[visibilityFilter].label.toLowerCase()} `}sites</div>,
          }}
        />
      </RenderIf>

      <RenderIf condition={dialogOpen}>
        <CreateSiteDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(site) => {
            navigate(`/sites/${site.id}`);
          }}
        />
      </RenderIf>
    </PageShell>
  );
}
