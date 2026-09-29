import { Button, EFormItemType, Empty, Popover, SchemaForm, Segmented, type TFormItemProps, message } from "devnonla-ui";
import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { Site } from "src/common/types";
import { normalizeSlugInput, slugify } from "src/common/utils/slug";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSite, fetchSites } from "./common/sitesSlice";
import { SITE_VISIBILITY_META, SiteCard, type SiteVisibility, siteVisibility } from "./components/SiteCard";

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

function NewSitePopover({ children, placement = "bottomRight" }: { children: ReactNode; placement?: "bottom" | "bottomRight" }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const prevName = useRef("");
  const form = useForm<CreateSiteValues>({ defaultValues: { name: "", slug: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    prevName.current = "";
    form.reset({ name: "", slug: "" });
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async ({ name, slug }) => {
    const n = name.trim();
    const s = slugify(slug);
    setSaving(true);
    try {
      const site = (await dispatch(createSite({ name: n, slug: s })).unwrap()) as Site;
      message.success("Site created");
      setOpen(false);
      navigate(`/sites/${site.id}`);
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement={placement}
      arrow
      contentClassName="w-80 max-w-none p-0"
      content={
        <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
          <p className="m-0 text-sm font-medium text-foreground">New site</p>
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
          <p className="m-0 -mt-1 text-xs text-muted-foreground">Public URL: /public/sites/{"{slug}"}</p>
          {rootError ? <p className="m-0 text-xs text-destructive">{rootError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="text" size="medium" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="medium" htmlType="submit" loading={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      }
    >
      {children}
    </Popover>
  );
}

export default function SitesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.sites.items) as Site[];
  const [loading, setLoading] = useState(items.length === 0);
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

  return (
    <PageShell className="pt-6">
      <MissingProviderCallout />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <RenderIf condition={items.length > 0}>
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
        </RenderIf>
        <NewSitePopover>
          <Button type="primary" className="ml-auto" icon={<Plus size={16} />}>
            New site
          </Button>
        </NewSitePopover>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No sites yet">
            <NewSitePopover placement="bottom">
              <Button type="primary" icon={<Plus size={16} />}>
                New site
              </Button>
            </NewSitePopover>
          </Empty>
        }
      >
        <RenderIf condition={loading && items.length === 0}>
          <div className="@container">
            <div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-3">
              {["a", "b"].map((key) => (
                <div key={key} className="overflow-hidden rounded-xl border border-border-subtle bg-card">
                  <div className="mx-2 mt-2 aspect-16/10 animate-pulse rounded-lg border border-border bg-muted shadow-[0_1px_2px_rgb(0_0_0/0.05)]" />
                  <div className="h-12" />
                </div>
              ))}
            </div>
          </div>
        </RenderIf>
        <RenderIf condition={filtered.length > 0}>
          <div className="@container">
            <div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-3">
              {filtered.map((site) => (
                <SiteCard key={site.id} site={site} onOpen={() => navigate(`/sites/${site.id}`)} />
              ))}
            </div>
          </div>
        </RenderIf>
        <RenderIf condition={!loading && items.length > 0 && filtered.length === 0}>
          <div className="py-8 text-center text-sm text-muted-foreground">No {SITE_VISIBILITY_META[visibilityFilter as SiteVisibility]?.label.toLowerCase() ?? ""} sites</div>
        </RenderIf>
      </RenderIf>
    </PageShell>
  );
}
