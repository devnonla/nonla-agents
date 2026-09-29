import { AgentChatbox, BackgroundTasksBar, type AgentMessage as ChatUiMessage, FluentIcon, Splitter } from "devnonla-ui";
import { PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient, authorizedFetch } from "src/common/api";
import { stopAgentChat } from "src/common/hooks/useAgent";
import type { AgentMessage } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { SelectModel } from "src/components/chat/_components/SelectModel";
import { RunCurrentScriptToolUI } from "src/components/chat/_components/tool-uis/RunCurrentScriptToolUI";
import { useConversationBgTasks } from "src/components/chat/hooks/useConversationBgTasks";
import { updateAgent } from "src/modules/agents/common/agentsSlice";
import { toChatUiMessage } from "src/modules/agents/common/chatMessageMap";
import { createConversation, fetchConversations, markConversationDone, setActiveConversationId, updateConversation } from "src/modules/agents/common/chatSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { ChatEmptyState } from "./components/ChatEmptyState";
import { ConversationList } from "./components/ConversationList";

const SIDEBAR_DEFAULT = 300;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;

const STARTERS = ["What can you help me with?", "Brainstorm a few ideas with me", "Walk me through how you work"] as const;

const APP_TOOL_UIS = [{ name: "run_current_script" as const, component: RunCurrentScriptToolUI }];

export function ChatPage() {
  const { agent, onProviderChange, setAiModel, selectedProviderId, aiModel, systemPrompt, onOpenConfig } = useAgentDetailContext();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeConversationId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const { tasks: bgTasks, cancellingIds, cancel: cancelBgTask } = useConversationBgTasks(activeConversationId);

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const agentRef = useRef(agent);
  agentRef.current = agent;
  const aiModelRef = useRef(aiModel);
  aiModelRef.current = aiModel;

  // Remount AgentChatbox when switching conversations; keep draft key while first send creates a conv
  const [chatKey, setChatKey] = useState(() => activeConversationId ?? `draft-${Date.now()}`);
  const [initialMessages, setInitialMessages] = useState<ChatUiMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastOpenSizeRef = useRef(SIDEBAR_DEFAULT);
  const prevAgentIdRef = useRef<string | null>(null);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const onSidebarResize = useCallback((next: number[]) => {
    const left = next[0];
    if (left != null && left > 0) lastOpenSizeRef.current = left;
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    const rows = await apiClient.get<AgentMessage[]>(`/api/conversations/${convId}/messages`);
    return rows.map(toChatUiMessage);
  }, []);

  // Load conversations when agent changes
  useEffect(() => {
    if (!agent) return;
    if (prevAgentIdRef.current === agent.id) return;
    prevAgentIdRef.current = agent.id;

    setInitialMessages([]);
    setChatKey(`draft-${Date.now()}`);
    dispatch(setActiveConversationId(null));
    const urlConvId = searchParams.get("conv");
    if (urlConvId) setLoading(true);
    dispatch(fetchConversations(agent.id))
      .unwrap()
      .then(async (convs) => {
        const target = urlConvId ? convs.find((c) => c.id === urlConvId && c.agentId === agent.id) : null;
        if (!target) return;
        dispatch(setActiveConversationId(target.id));
        setInitialMessages(await loadMessages(target.id));
        setChatKey(target.id);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on agent switch
  }, [agent?.id]);

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      if (convId === activeConversationIdRef.current && chatKey === convId) return;
      setLoading(true);
      try {
        setInitialMessages(await loadMessages(convId));
        setChatKey(convId);
        dispatch(setActiveConversationId(convId));
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set("conv", convId);
            return p;
          },
          { replace: true },
        );
      } finally {
        setLoading(false);
      }
    },
    [dispatch, setSearchParams, loadMessages, chatKey],
  );

  const chatPaneRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);

  const handleNewChat = useCallback(() => {
    dispatch(setActiveConversationId(null));
    activeConversationIdRef.current = null;
    setInitialMessages([]);
    pendingFocusRef.current = true;
    setChatKey(`draft-${Date.now()}`);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("conv");
        return p;
      },
      { replace: true },
    );
  }, [dispatch, setSearchParams]);

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    chatPaneRef.current?.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.focus({ preventScroll: true });
  }, [chatKey]);

  const ensureConversation = useCallback(
    async (text: string) => {
      let convId = activeConversationIdRef.current;
      const currentAgent = agentRef.current;
      if (!convId) {
        const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        const created = await dispatch(createConversation({ agentId: currentAgent.id, title })).unwrap();
        convId = created.id;
        activeConversationIdRef.current = convId;
        dispatch(setActiveConversationId(convId));
        void dispatch(fetchConversations(currentAgent.id));
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set("conv", created.id);
            return p;
          },
          { replace: true },
        );
      } else {
        const active = conversationsRef.current.find((c) => c.id === convId);
        if (active?.title === "New Chat") {
          const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
          void dispatch(updateConversation({ id: convId, title }));
        }
      }
      return convId;
    },
    [dispatch, setSearchParams],
  );

  // AgentChatbox owns streaming UI — app only returns SSE Response
  const send = useCallback(
    async ({ text, signal }: { text: string; signal: AbortSignal }) => {
      if (!(aiModelRef.current || agentRef.current.aiModel)) {
        throw new Error("Select a model to start chatting");
      }
      const convId = await ensureConversation(text);
      return authorizedFetch(`/api/conversations/${convId}/chat`, {
        method: "POST",
        body: JSON.stringify({ agentId: agentRef.current.id, message: text }),
        signal,
      });
    },
    [ensureConversation],
  );

  const resume = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    const convId = activeConversationIdRef.current;
    if (!convId) return null;
    const conv = conversationsRef.current.find((c) => c.id === convId);
    if (conv?.status !== "running") return null;

    const res = await authorizedFetch(`/api/conversations/${convId}/stream`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal,
    });
    return res.ok && res.body ? res : null;
  }, []);

  const onStop = useCallback(async () => {
    const convId = activeConversationIdRef.current;
    if (!convId) return;
    await stopAgentChat(agentRef.current.id, convId);
    void dispatch(fetchConversations(agentRef.current.id));
  }, [dispatch]);

  const onGeneratingChange = useCallback(
    (generating: boolean) => {
      if (generating) return;
      const convId = activeConversationIdRef.current;
      if (convId) dispatch(markConversationDone(convId));
      void dispatch(fetchConversations(agentRef.current.id));
    },
    [dispatch],
  );

  const noModel = !(aiModel || agent.aiModel);
  const hasInstruct = Boolean(systemPrompt.trim());

  return (
    <Splitter className="h-full w-full overflow-hidden" onResize={onSidebarResize}>
      {sidebarOpen ? (
        <Splitter.Panel key="chats" defaultSize={lastOpenSizeRef.current} min={SIDEBAR_MIN} max={SIDEBAR_MAX} className="min-h-0 overflow-hidden">
          <ConversationList onSelectConversation={handleSelectConversation} onCloseSidebar={closeSidebar} />
        </Splitter.Panel>
      ) : null}

      <Splitter.Panel key="chat" min="40%" className="min-h-0 overflow-hidden">
        <div className="@container relative flex h-full min-w-0 flex-1 flex-col">
          {!sidebarOpen && (
            <div className="absolute top-2 left-2 z-20">
              <button type="button" onClick={openSidebar} className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Open sidebar" title="Open sidebar">
                <PanelLeftOpen size={16} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <span className="animate-pulse text-[12px] text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <div ref={chatPaneRef} className={["relative flex min-h-0 flex-1 flex-col"].join(" ")}>
              <AgentChatbox
                key={chatKey}
                initialMessages={initialMessages}
                send={send}
                resume={resume}
                onStop={onStop}
                onGeneratingChange={onGeneratingChange}
                name={agent.name}
                description={agent.description ?? undefined}
                avatar={<UserAvatar avatar={agent.avatar} name={agent.name} size={56} />}
                starters={[...STARTERS]}
                emptyState={!hasInstruct ? <ChatEmptyState agent={agent} missingInstruct onAddInstruct={() => onOpenConfig("instruct")} /> : undefined}
                placeholder={noModel ? "Select a model to start chatting" : `Message ${agent.name}...`}
                toolUis={APP_TOOL_UIS}
                toolbar={
                  <>
                    <button type="button" onClick={handleNewChat} className="flex size-5.5 cursor-pointer items-center justify-center rounded-full text-foreground/90 outline-none transition-all duration-150 hover:bg-border/60" title="New chat" aria-label="New chat">
                      <FluentIcon name="chat-add-24" size={14} />
                    </button>
                    <SelectModel
                      providerId={selectedProviderId ?? agent.aiProvider ?? undefined}
                      model={aiModel || agent.aiModel || undefined}
                      onChange={(pid, m) => {
                        onProviderChange(pid);
                        setAiModel(m);
                        void dispatch(updateAgent({ id: agent.id, aiProvider: pid, aiModel: m }));
                      }}
                    />
                  </>
                }
                accessory={
                  <BackgroundTasksBar tasks={bgTasks} cancellingIds={cancellingIds} onCancel={cancelBgTask}>
                    <div className="h-0" aria-hidden />
                  </BackgroundTasksBar>
                }
              />
            </div>
          )}
        </div>
      </Splitter.Panel>
    </Splitter>
  );
}
