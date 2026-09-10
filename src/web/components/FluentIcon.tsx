import { useEffect, useState } from "react";
import { cn } from "src/lib/utils";
import { ensureFluentIcons, getFluentImgSrc } from "src/modules/tools/common/iconify";

export function FluentIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(() => getFluentImgSrc(name));

  useEffect(() => {
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
  }, [name]);

  if (!src) {
    return <span aria-hidden className={cn("inline-block shrink-0", className)} style={{ width: size, height: size }} />;
  }

  return <img src={src} alt="" width={size} height={size} draggable={false} className={cn("shrink-0 select-none pointer-events-none", className)} />;
}
