import { ChatRoundIcon } from "@solar-icons/react/dynamic/chat-round";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { SidebarMinimalisticIcon } from "@solar-icons/react/dynamic/sidebar-minimalistic";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { UserAvatar } from "src/components/UserAvatar";
import type { ConvMeta, PublicAgent } from "./types";

interface ChatSidebarProps {
  agent: PublicAgent;
  conversations: ConvMeta[];
  conversationId: string | null;
  processingConvIds: Set<string>;
  width?: number;
  onCloseSidebar: () => void;
  onNewConversation: () => void;
  onSwitchConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
}

export function ChatSidebar({ agent, conversations, conversationId, processingConvIds, width = 260, onCloseSidebar, onNewConversation, onSwitchConversation, onDeleteConversation }: ChatSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-card shrink-0 overflow-hidden" style={{ width }}>
      <div className="flex items-center gap-3 px-3.5 pt-4 pb-3.5 shrink-0 min-w-0">
        <UserAvatar name={agent.name} size={40} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-foreground truncate leading-snug">{agent.name}</div>
        </div>
        <button type="button" onClick={onCloseSidebar} className="flex items-center justify-center size-8 shrink-0 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors" aria-label="Close sidebar" title="Close sidebar">
          <SidebarMinimalisticIcon size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 pb-2 shrink-0">
        <button type="button" onClick={onNewConversation} className="flex-1 flex items-center gap-2.5 min-w-0 px-2.5 py-2 rounded-lg text-[13px] font-medium text-foreground bg-muted/70 hover:bg-muted border-none cursor-pointer transition-colors font-[inherit]">
          <PenNewSquareIcon size={15} className="shrink-0" />
          <span className="truncate">New chat</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1 px-1 space-y-px">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-3">
            <ChatRoundIcon size={18} className="text-muted-foreground opacity-40" />
            <span className="text-[11px] text-muted-foreground">No conversations yet</span>
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === conversationId;
          const isProcessing = processingConvIds.has(conv.id);

          return (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => onSwitchConversation(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "") {
                  e.preventDefault();
                  onSwitchConversation(conv.id);
                }
              }}
              className={["relative w-full flex items-center gap-2 py-2 px-2.5 rounded-lg text-left cursor-pointer border-none group", isActive ? "bg-primary/8" : "bg-transparent hover:bg-muted/80"].join(" ")}
            >
              <span className={["flex-1 min-w-0 text-sm truncate font-normal text-foreground", "group-hover:pr-6 group-focus-within:pr-7"].join(" ")}>{conv.title || "Untitled"}</span>

              {isProcessing && (
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
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conv.id);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden items-center justify-center size-6 rounded-md cursor-pointer border-none bg-muted text-muted-foreground hover:bg-red-500/20 hover:text-destructive group-hover:flex group-focus-within:flex"
                title="Delete conversation"
                tabIndex={-1}
              >
                <TrashBinMinimalisticIcon size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
