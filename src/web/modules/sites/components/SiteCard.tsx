import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { LockIcon } from "@solar-icons/react/dynamic/lock";
import { SquareTopDownIcon } from "@solar-icons/react/dynamic/square-top-down";
import { UnlinkMinimalisticIcon } from "@solar-icons/react/dynamic/unlink-minimalistic";
import { Button, Popover } from "antd";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { Site } from "src/common/types";
import { RawButton } from "src/components/RawButton";
import RenderIf from "src/components/RenderIf";
import { sitesApi } from "../common/sitesApi";

export type SiteVisibility = "unpublished" | "protected" | "public";

export function siteVisibility(site: Site): SiteVisibility {
  if (!site.isPublished) return "unpublished";
  if (site.hasPublicPassword) return "protected";
  return "public";
}

export const SITE_VISIBILITY_META: Record<SiteVisibility, { label: string; description: string; className: string; icon: ReactNode }> = {
  unpublished: {
    label: "Unpublished",
    description: "Hidden from the public URL. Only editors can open it here.",
    className: "text-muted-foreground",
    icon: <UnlinkMinimalisticIcon size={14} />,
  },
  protected: {
    label: "Protected",
    description: "Published with a password. Visitors must unlock to view.",
    className: "text-warn",
    icon: <LockIcon size={14} />,
  },
  public: {
    label: "Public",
    description: "Anyone with the link can view this site.",
    className: "text-success",
    icon: <GlobalIcon size={14} />,
  },
};

function SitePreview({ site, publicPath }: { site: Site; publicPath: string }) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setThumbLoading(true);
    setThumbFailed(false);
    setThumbSrc(null);

    void sitesApi
      .getThumbnail(site.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setThumbFailed(true);
      })
      .finally(() => {
        if (!cancelled) setThumbLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [site.id, site.draftUpdatedAt, site.updatedAt]);

  return (
    <div className="flex w-55 flex-col gap-2 p-1">
      <div className="relative aspect-16/10 overflow-hidden rounded-lg border border-border-subtle bg-muted">
        <RenderIf
          condition={!!thumbSrc && !thumbFailed}
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <GlobalIcon size={18} weight="BoldDuotone" />
              <span className="text-[10px]">{thumbLoading ? "…" : "—"}</span>
            </div>
          }
        >
          <img src={thumbSrc ?? undefined} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />
        </RenderIf>
      </div>
      <RenderIf condition={site.isPublished}>
        <Button
          type="primary"
          size="small"
          block
          icon={<SquareTopDownIcon size={14} />}
          onClick={(e) => {
            e.stopPropagation();
            window.open(publicPath, "_blank", "noopener,noreferrer");
          }}
        >
          Open site
        </Button>
      </RenderIf>
    </div>
  );
}

export function SiteOpenPublicButton({ site }: { site: Site }) {
  if (!site.isPublished) return null;

  return (
    <RawButton
      type="text"
      size="xs"
      icon={<SquareTopDownIcon size={12} />}
      aria-label={`Open ${site.name}`}
      onClick={(e) => {
        e.stopPropagation();
        window.open(`/public/sites/${site.slug}`, "_blank", "noopener,noreferrer");
      }}
    >
      Open
    </RawButton>
  );
}

export function SiteVisibilityIcon({ site }: { site: Site }) {
  const meta = SITE_VISIBILITY_META[siteVisibility(site)];

  return (
    <Popover
      trigger="hover"
      placement="top"
      arrow={{ pointAtCenter: true }}
      mouseEnterDelay={0.2}
      mouseLeaveDelay={0.1}
      content={
        <div className="max-w-55 p-0.5">
          <p className="m-0 text-sm font-medium text-foreground">{meta.label}</p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      }
    >
      <span className={cn("inline-flex size-5 cursor-help items-center justify-center", meta.className)} aria-label={meta.label} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {meta.icon}
      </span>
    </Popover>
  );
}

export function SiteNameCell({ site, onOpen }: { site: Site; onOpen: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const publicPath = `/public/sites/${site.slug}`;

  return (
    <Popover trigger="hover" placement="bottomLeft" mouseEnterDelay={0.25} mouseLeaveDelay={0.15} open={previewOpen} onOpenChange={setPreviewOpen} content={previewOpen ? <SitePreview site={site} publicPath={publicPath} /> : null}>
      <button type="button" onClick={onOpen} className="m-0 min-w-0 max-w-full cursor-pointer border-0 bg-transparent p-0 text-left" aria-label={`Open ${site.name}`}>
        <span className="block truncate text-sm font-medium text-foreground hover:text-brand-soft">{site.name}</span>
      </button>
    </Popover>
  );
}
