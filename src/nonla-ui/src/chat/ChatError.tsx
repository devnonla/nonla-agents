import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type ChatErrorProps = {
  children: ReactNode;
  className?: string;
};

export function ChatError({ children, className }: ChatErrorProps) {
  return (
    <div className={cn("nonla-chat-error px-4 py-1", className)}>
      <div className="text-xs px-3 py-2.5 rounded-md bg-accent border border-destructive/30 text-destructive leading-relaxed">
        {children}
      </div>
    </div>
  );
}
