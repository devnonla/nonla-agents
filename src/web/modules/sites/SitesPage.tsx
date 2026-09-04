import { Button, EFormItemType, Empty, Modal, SchemaForm, Segmented, type TFormItemProps, Table, message } from "@nonla-agents/ui";
import type { ColumnsType } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { Site } from "src/common/types";
import { normalizeSlugInput, slugify } from "src/common/utils/slug";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSite, fetchSites } from "./common/sitesSlice";
import { SITE_VISIBILITY_META, SiteNameCell, SiteOpenPublicButton, type SiteVisibility, SiteVisibilityIcon, siteVisibility } from "./components/SiteCard";

type VisibilityFilter = "all" | SiteVisibility;

type CreateSiteValues = { name: string; slug: string };

const SITE_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
    options: { placeholder: "News page", autoFocus: true },
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
    options: { placeholder: "news" },
  },
];

function CreateSiteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (site: Site) => void }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const prevName = useRef("");
  const form = useForm<CreateSiteValues>({ defaultValues: { name: "", slug: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  const onSubmit = form.handleSubmit(async ({ name, slug }) => {
    const n = name.trim();
    const s = slugify(slug);
    setSaving(true);
    try {
      const site = (await dispatch(createSite({ name: n, slug: s })).unwrap()) as Site;
      message.success("Site created");
      onCreated(site);
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title="New site" onCancel={onClose} onOk={() => void onSubmit()} okText="Create" confirmLoading={saving} destroyOnHidden>
      <form onSubmit={onSubmit}>
        <SchemaForm
          form={form}
          items={SITE_ITEMS}
          valuesChangeDebounce={0}
          onValuesChange={(all) => {
            const normalized = normalizeSlugInput(all.slug);
            if (normalized !== all.slug) {
              form.setValue("slug", normalized);
              prevName.current = all.name;
              return;
            }
            if (!all.slug || all.slug === slugify(prevName.current)) {
              const next = slugify(all.name);
              if (next !== all.slug) form.setValue("slug", next);
            }
            prevName.current = all.name;
          }}
        />
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">Public URL: /public/sites/{"{slug}"}</p>
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
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
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No sites yet">
            <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialogOpen(true)}>
              New site
            </Button>
          </Empty>
        }
      >
        <div className="mb-3">
          <Segmented
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
        <Table
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
