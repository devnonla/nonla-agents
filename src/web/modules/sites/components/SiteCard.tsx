import { FluentIcon, Popover } from "devnonla-ui";
import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { Site } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { sitesApi } from "../common/sitesApi";

export type SiteVisibility = "unpublished" | "protected" | "public";

export function siteVisibility(site: Site): SiteVisibility {
  if (!site.isPublished) return "unpublished";
  if (site.hasPublicPassword) return "protected";
  return "public";
}

export const SITE_VISIBILITY_META: Record<SiteVisibility, { label: string; description: string; icon: string }> = {
  unpublished: {
    label: "Unpublished",
    description: "Hidden from the public URL. Only editors can open it here.",
    icon: "cloud-dismiss-24",
  },
  protected: {
    label: "Protected",
    description: "Published with a password. Visitors must unlock to view.",
    icon: "globe-shield-24",
  },
  public: {
    label: "Public",
    description: "Anyone with the link can view this site.",
    icon: "globe-24",
  },
};

/** Drop transparent gutters left by the preview capture, so cover fills the card. */
async function cropToOpaque(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const source = document.createElement("canvas");
  source.width = bitmap.width;
  source.height = bitmap.height;
  const ctx = source.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return blob;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  if (cropW === width && cropH === height) return blob;

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  out.getContext("2d")?.drawImage(source, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  const cropped = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  return cropped ?? blob;
}

function SiteThumbnail({ site, onEdit, publicPath }: { site: Site; onEdit: () => void; publicPath: string }) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setThumbFailed(false);
    setThumbSrc(null);

    void sitesApi
      .getThumbnail(site.id)
      .then((blob) => cropToOpaque(blob))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setThumbFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [site.id, site.draftUpdatedAt, site.updatedAt]);

  return (
    <div className="relative mx-2 mt-2 aspect-16/10 overflow-hidden rounded-lg border border-border bg-muted shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
      <RenderIf
        condition={!!thumbSrc && !thumbFailed}
        fallback={
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <FluentIcon name="globe-24" size={22} />
          </div>
        }
      >
        <img src={thumbSrc ?? undefined} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ objectFit: "cover", objectPosition: "top center" }} />
      </RenderIf>
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-white/95 text-foreground shadow-sm">
          <Pencil size={16} />
        </button>
        <a href={publicPath} target="_blank" rel="noopener noreferrer" aria-label="Open site" title="Open site" className="inline-flex size-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-sm">
          <ExternalLink size={16} />
        </a>
      </div>
    </div>
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
      <span className="inline-flex size-5 shrink-0 cursor-help items-center justify-center" aria-label={meta.label} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <FluentIcon name={meta.icon} size={16} />
      </span>
    </Popover>
  );
}

export function SiteCard({ site, onOpen }: { site: Site; onOpen: () => void }) {
  const publicPath = `/public/sites/${site.slug}`;
  const visibility = SITE_VISIBILITY_META[siteVisibility(site)];

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-card text-left transition-[border-color] duration-200 hover:border-brand/40">
      <SiteThumbnail site={site} onEdit={onOpen} publicPath={publicPath} />

      <div className="pt-3 pb-3">
        <div className="px-3 truncate text-[16px] font-semibold text-foreground">{site.name}</div>

        <div className="mt-2 flex flex-col gap-1 pt-2 border-t border-border-subtle">
          {/*  */}
          <div className="px-3 flex items-center gap-2 text-[11px] leading-4 py-1">
            <span className="w-16 shrink-0 text-muted-foreground flex-1">Visibility</span>
            <span className="inline-flex min-w-0 items-center gap-1 text-foreground">
              <SiteVisibilityIcon site={site} />
              {visibility.label}
            </span>
          </div>

          <div className="px-3 flex items-center gap-2 text-[11px] leading-4 py-1">
            <span className="flex-1 shrink-0 text-muted-foreground">Link</span>
            <span className="truncate font-mono text-tertiary-foreground">{publicPath}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
