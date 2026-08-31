import type { ReactNode } from "react";
import { cn } from "src/common/lib/cn";

/** Shared content rail for AppLayout pages — keeps max-width and gutters aligned. */
export function PageShell({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("py-8 px-10", className)}>
      <div className={cn("mx-auto w-full max-w-6xl", contentClassName)}>{children}</div>
    </div>
  );
}
