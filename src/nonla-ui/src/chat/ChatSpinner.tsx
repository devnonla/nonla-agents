import { cn } from "../lib/cn";

export function ChatSpinner({ className }: { className?: string }) {
  return <span className={cn("size-3 shrink-0 rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground animate-spin", className)} aria-hidden />;
}
