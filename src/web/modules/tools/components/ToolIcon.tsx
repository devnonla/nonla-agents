import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import type { ReactNode } from "react";
import { cn } from "src/lib/utils";
import { isSvgIcon, withThinStroke } from "../common/iconify";

interface ToolIconProps {
  icon?: string | null;
  size?: number;
  className?: string;
  fallback?: ReactNode;
}

export function ToolIcon({ icon, size = 16, className, fallback }: ToolIconProps) {
  if (isSvgIcon(icon)) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full", className)}
        style={{ width: size, height: size }}
        // Trusted Iconify Lucide SVG stored on the tool row
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG markup from Iconify
        dangerouslySetInnerHTML={{ __html: withThinStroke(icon!.trim()) }}
      />
    );
  }

  if (fallback !== undefined) return <>{fallback}</>;
  return <ProgrammingIcon size={size} className={className} />;
}
