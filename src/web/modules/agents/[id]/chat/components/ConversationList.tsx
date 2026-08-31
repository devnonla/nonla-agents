import { ChatRoundIcon } from "@solar-icons/react/dynamic/chat-round";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { SidebarMinimalisticIcon } from "@solar-icons/react/dynamic/sidebar-minimalistic";
import { useCallback, useMemo } from "react";
import type { AgentConversation } from "src/common/types";
import { deleteConversation } from "src/modules/agents/common/chatSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { ConversationItem } from "./ConversationItem";

interface ConversationListProps {
  onNewChat: () => void;
  onSelectConversation: (convId: string) => void;
  onCloseSidebar: () => void;
  width?: number;
}

export function ConversationList({ onNewChat, onSelectConversation, onCloseSidebar, width = 260 }: ConversationListProps) {
  const dispatch = useAppDispatch();
  const { agent } = useAgentDetailContext();
  const conversations = useAppSelector((s) => s.chat.conversations);
  const activeConversationId = useAppSelector((s) => s.chat.activeConversationId);

  const agentConversations = useMemo(() => conversations.filter((c) => c.agentId === agent.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [conversations, agent.id]);

  const handleSelect = useCallback(
    (conv: AgentConversation) => {
      if (conv.id === activeConversationId) return;
      onSelectConversation(conv.id);
    },
    [activeConversationId, onSelectConversation],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, convId: string) => {
      e.stopPropagation();
      await dispatch(deleteConversation(convId));
    },
    [dispatch],
  );

  return (
    <div className="flex flex-col h-full bg-card shrink-0 overflow-hidden" style={{ width }}>
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 shrink-0">
        <button type="button" onClick={onNewChat} className="flex-1 flex items-center gap-2.5 min-w-0 px-2.5 py-2 rounded-lg text-[13px] font-medium text-foreground bg-muted/70 hover:bg-muted border-none cursor-pointer transition-colors font-[inherit]">
          <PenNewSquareIcon size={15} className="shrink-0" />
          <span className="truncate">New chat</span>
        </button>
        <button type="button" onClick={onCloseSidebar} className="flex items-center justify-center size-8 shrink-0 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors" aria-label="Close sidebar" title="Close sidebar">
          <SidebarMinimalisticIcon size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1 px-1 space-y-px">
        {agentConversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-3">
            <ChatRoundIcon size={18} className="text-muted-foreground opacity-40" />
            <span className="text-[11px] text-muted-foreground">No conversations yet</span>
          </div>
        )}

        {agentConversations.map((conv) => (
          <ConversationItem key={conv.id} conversation={conv} isActive={conv.id === activeConversationId} onSelect={handleSelect} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
