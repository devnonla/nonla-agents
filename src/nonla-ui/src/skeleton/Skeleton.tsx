import { type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type SkeletonProps = {
  active?: boolean;
  loading?: boolean;
  paragraph?: boolean | { rows?: number };
  title?: boolean;
  avatar?: boolean;
  className?: string;
  children?: ReactNode;
};

function SkeletonRoot({ active = true, loading = true, paragraph = true, title = true, avatar, className, children }: SkeletonProps) {
  if (!loading && children) return <>{children}</>;
  const rows = typeof paragraph === "object" ? (paragraph.rows ?? 3) : paragraph ? 3 : 0;
  const pulse = active ? "animate-pulse" : "";
  return (
    <div className={cn("flex gap-3", className)}>
      {avatar ? <div className={cn("size-10 shrink-0 rounded-full bg-secondary", pulse)} /> : null}
      <div className="flex-1 space-y-2">
        {title ? <div className={cn("h-4 w-1/3 rounded bg-secondary", pulse)} /> : null}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={cn("h-3 rounded bg-secondary", pulse, i === rows - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

export type SkeletonInputProps = {
  active?: boolean;
  block?: boolean;
  className?: string;
  style?: CSSProperties;
};

function SkeletonInput({ active = true, block, className, style }: SkeletonInputProps) {
  return (
    <div
      className={cn("h-8 rounded-md bg-secondary", active && "animate-pulse", block ? "w-full" : "w-40", className)}
      style={style}
    />
  );
}

export const Skeleton = Object.assign(SkeletonRoot, { Input: SkeletonInput });
