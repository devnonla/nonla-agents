import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
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
      <span className={["flex-1 min-w-0 text-sm truncate font-normal text-foreground", "group-hover:pr-6 group-focus-within:pr-7"].join(" ")}>{conversation.title || "Untitled"}</span>

      {conversation.status === "running" && (
        <span
          className="shrink-0 inline-block rounded-full animate-spin"
          style={{
            width: 12,
            height: 12,
            border: "2px solid color-mix(in srgb, var(--primary) 20%, transparent)",
            borderTopColor: "var(--primary)",
          }}
        />
      )}

      <button
        type="button"
        onClick={(e) => void onDelete(e, conversation.id)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden items-center justify-center size-6 rounded-md cursor-pointer border-none bg-muted text-muted-foreground hover:bg-red-500/20 hover:text-destructive group-hover:flex group-focus-within:flex"
        title="Delete conversation"
        tabIndex={-1}
      >
        <TrashBinMinimalisticIcon size={12} />
      </button>
    </div>
  );
}
