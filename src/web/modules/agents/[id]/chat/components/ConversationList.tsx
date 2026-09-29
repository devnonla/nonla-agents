import { OverlayScroll } from "devnonla-ui";
import { PanelLeftClose } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { AgentConversation } from "src/common/types";
import { deleteConversation } from "src/modules/agents/common/chatSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { ConversationItem } from "./ConversationItem";

interface ConversationListProps {
  onSelectConversation: (convId: string) => void;
  onCloseSidebar: () => void;
}

export function ConversationList({ onSelectConversation, onCloseSidebar }: ConversationListProps) {
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
    (e: React.MouseEvent, convId: string) => {
      e.preventDefault();
      e.stopPropagation();
      void dispatch(deleteConversation(convId));
    },
    [dispatch],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/50">
      <div className="flex shrink-0 items-center justify-between gap-1 px-2 pt-2 pb-1">
        <span className="px-2.5 text-[12px] font-medium text-muted-foreground">Chats</span>
        <button type="button" onClick={onCloseSidebar} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close sidebar" title="Close sidebar">
          <PanelLeftClose className="text-muted-foreground" strokeWidth={1.5} size={16} />
        </button>
      </div>
      <OverlayScroll className="min-h-0 flex-1" innerClassName="px-2 pb-6">
        <nav aria-label="Chats">
          {agentConversations.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">No conversations yet</p> : agentConversations.map((conv) => <ConversationItem key={conv.id} conversation={conv} isActive={conv.id === activeConversationId} onSelect={handleSelect} onDelete={handleDelete} />)}
        </nav>
      </OverlayScroll>
    </div>
  );
}
