import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "src/lib/utils";
import { DEFAULT_TOOL_ICON, ensureFluentIcons, fluentIconName, getFluentImgSrc, isFluentIcon, isSvgIcon } from "../common/iconify";

interface ToolIconProps {
  icon?: string | null;
  size?: number;
  className?: string;
  fallback?: ReactNode;
}

export function ToolIcon({ icon, size = 16, className, fallback }: ToolIconProps) {
  const resolved = isSvgIcon(icon) ? icon! : isFluentIcon(icon) ? icon! : DEFAULT_TOOL_ICON;
  const fluent = isFluentIcon(resolved);
  const name = fluent ? fluentIconName(resolved) : "";
  const [src, setSrc] = useState<string | null>(() => (fluent ? getFluentImgSrc(name) : null));

  useEffect(() => {
    if (!fluent) {
      setSrc(null);
      return;
    }
    const cached = getFluentImgSrc(name);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    void ensureFluentIcons().then(() => {
      if (!cancelled) setSrc(getFluentImgSrc(name));
    });
    return () => {
      cancelled = true;
    };
  }, [fluent, name]);

  if (fluent) {
    if (src) return <img src={src} alt="" width={size} height={size} draggable={false} className={cn("shrink-0 select-none", className)} />;
    if (fallback !== undefined) return <>{fallback}</>;
    return <span className={cn("inline-block shrink-0 rounded-sm bg-foreground/10", className)} style={{ width: size, height: size }} />;
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full", className)}
      style={{ width: size, height: size }}
      // Legacy Lucide SVG stored on older tool rows
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG markup from Iconify
      dangerouslySetInnerHTML={{ __html: resolved.trim() }}
    />
  );
}
