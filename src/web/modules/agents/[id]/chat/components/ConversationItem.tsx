import { Button, Spin } from "devnonla-ui";
import { X } from "lucide-react";
import type { AgentConversation } from "src/common/types";

interface ConversationItemProps {
  conversation: AgentConversation;
  isActive: boolean;
  onSelect: (conv: AgentConversation) => void;
  onDelete: (e: React.MouseEvent, convId: string) => void;
}

export function ConversationItem({ conversation, isActive, onSelect, onDelete }: ConversationItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void onSelect(conversation)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onSelect(conversation);
        }
      }}
      className={["relative w-full flex items-center gap-2 py-2 px-2.5 rounded-lg text-left cursor-pointer border-none group", isActive ? "bg-primary/8" : "bg-transparent hover:bg-muted/80"].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate pr-6 text-sm font-medium text-foreground">{conversation.title || "Untitled"}</span>

      {conversation.status === "running" && <Spin size="small" className="shrink-0" />}

      <Button
        type="text"
        size="small"
        danger
        icon={<X />}
        styles={{ icon: { width: 12, height: 12 } }}
        title="Delete conversation"
        aria-label="Delete conversation"
        tabIndex={-1}
        onClick={(e) => void onDelete(e, conversation.id)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6! px-0! opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      />
    </div>
  );
}
