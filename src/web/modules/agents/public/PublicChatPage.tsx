import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { SidebarMinimalisticIcon } from "@solar-icons/react/dynamic/sidebar-minimalistic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { wsClient } from "src/common/api/wsClient";
import { useAgentRunner } from "src/common/hooks/useAgent";
import { useChatStreaming } from "src/common/hooks/useChatStreaming";
import { useStreamResume } from "src/common/hooks/useStreamResume";
import type { AgentMessage } from "src/common/types";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";
import { ChatEmptyState, ChatSidebar, ErrorScreen, HIDDEN_TOOL_NAMES, LoadingScreen, PasswordGate, getFingerprint, toDisplayMsg } from "./components";
import type { ConvMeta, PublicAgent } from "./components";

const SIDEBAR_DEFAULT = 300;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;

export default function PublicChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<PublicAgent | null>(null);

  const [enteredPassword, setEnteredPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [conversations, setConversations] = useState<ConvMeta[]>([]);
  const [processingConvIds, setProcessingConvIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const { run, running, cancel } = useAgentRunner();

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const { scrollRef, scrollToBottom } = useAutoScroll({ onScrolledUpChange: setIsScrolledUp });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const agentId = agent?.id;

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartW.current = sidebarWidth;
      setIsResizing(true);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dx = e.clientX - resizeStartX.current;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, resizeStartW.current + dx)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setIsResizing(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const refreshConversations = async (aId: string) => {
    const fp = getFingerprint();
    const res = await fetch(`/api/public/agents/${aId}/conversations?fp=${fp}`);
    if (res.ok) {
      const data: ConvMeta[] = await res.json();
      setConversations(data);
      return data;
    }
    return [];
  };

  const refreshConversationsRef = useRef(refreshConversations);
  refreshConversationsRef.current = refreshConversations;

  const fetchMessages = useCallback(
    async (convId: string) => {
      if (!agentId) return [];
      const fp = getFingerprint();
      const res = await fetch(`/api/public/agents/${agentId}/conversations/${convId}?fp=${fp}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { messages?: AgentMessage[] };
      return data.messages ?? [];
    },
    [agentId],
  );

  const markProcessing = useCallback((cId: string) => {
    setProcessingConvIds((prev) => {
      const next = new Set(prev);
      next.add(cId);
      return next;
    });
  }, []);

  const unmarkProcessing = useCallback((cId: string) => {
    setProcessingConvIds((prev) => {
      const next = new Set(prev);
      next.delete(cId);
      return next;
    });
  }, []);

  const messageFilter = useCallback((m: { role: string; toolName?: string }) => !(m.role === "tool-call" && m.toolName && HIDDEN_TOOL_NAMES.has(m.toolName)), []);

  const markTerminalRef = useRef<(convId: string) => void>(() => {});
  const handleConnectionLostRef = useRef<() => void>(() => {});

  const handleConversationDone = useCallback(
    async (convId: string) => {
      markTerminalRef.current(convId);
      unmarkProcessing(convId);
      if (agentId) refreshConversationsRef.current(agentId);
    },
    [unmarkProcessing, agentId],
  );

  const handleConversationError = useCallback(
    async (convId: string, error?: string) => {
      if (error === "Connection lost") {
        handleConnectionLostRef.current();
        if (agentId) {
          const convs = await refreshConversationsRef.current(agentId);
          const stillRunning = convs.some((c) => c.id === convId && c.status === "running");
          if (!stillRunning) unmarkProcessing(convId);
        }
        return;
      }
      markTerminalRef.current(convId);
      unmarkProcessing(convId);
      if (agentId) refreshConversationsRef.current(agentId);
    },
    [unmarkProcessing, agentId],
  );

  const { setMessages, streamingContent, thinkingContent, activityStatus, clearStreamingState, buildSSECallbacks, loadMessages, liveMessages } = useChatStreaming({
    toDisplayMsg,
    messageFilter,
    fetchMessages,
    onConversationDone: handleConversationDone,
    onConversationError: handleConversationError,
  });

  const isServerRunning = Boolean(conversationId && processingConvIds.has(conversationId));
  const streamConnectOptions = useMemo(() => (agentId ? { fingerprint: getFingerprint(), agentId } : undefined), [agentId]);

  const { markTerminal, handleConnectionLost } = useStreamResume({
    running,
    conversationId,
    isServerRunning,
    buildSSECallbacks,
    loadMessages,
    connectOptions: streamConnectOptions,
  });
  markTerminalRef.current = markTerminal;
  handleConnectionLostRef.current = handleConnectionLost;

  useLayoutEffect(() => {
    if (isScrolledUp) return;
    scrollToBottom();
  }, [liveMessages.length, streamingContent, thinkingContent, activityStatus, isScrolledUp, scrollToBottom]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/public/agents/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Unavailable");
          return;
        }

        setAgent(data);

        if (!data.requiresPassword) {
          setIsAuthenticated(true);
          return;
        }

        const savedToken = localStorage.getItem(`public_auth_${id}`);
        if (savedToken) {
          try {
            const tokenRes = await fetch(`/api/public/agents/${id}/verify-token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: savedToken }),
            });
            const tokenData = await tokenRes.json();
            if (tokenData.valid) {
              setIsAuthenticated(true);
            } else {
              localStorage.removeItem(`public_auth_${id}`);
            }
          } catch {
            localStorage.removeItem(`public_auth_${id}`);
          }
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const switchConversation = async (aId: string, cId: string) => {
    const fp = getFingerprint();
    setMessages([]);
    clearStreamingState();
    setConversationId(cId);
    navigate(`/chat/${aId}?conv=${cId}`, { replace: true });
    const res = await fetch(`/api/public/agents/${aId}/conversations/${cId}?fp=${fp}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  };

  const deleteConversation = async (aId: string, cId: string) => {
    const fp = getFingerprint();
    await fetch(`/api/public/agents/${aId}/conversations/${cId}?fp=${fp}`, {
      method: "DELETE",
    });
    const convs = await refreshConversations(aId);
    if (cId === conversationId) {
      const next = convs.find((c) => c.id !== cId);
      if (next) {
        await switchConversation(aId, next.id);
      } else {
        await newConversation(aId);
      }
    }
  };

  const newConversation = (aId: string) => {
    if (running) return;
    setConversationId(null);
    setMessages([]);
    clearStreamingState();
    navigate(`/chat/${aId}`, { replace: true });
  };

  useEffect(() => {
    if (!isAuthenticated || !agentId) return;
    (async () => {
      const convs = await refreshConversations(agentId);
      const urlConvId = searchParams.get("conv");
      const target = urlConvId ? convs.find((c) => c.id === urlConvId) : null;
      if (target) {
        await switchConversation(agentId, target.id);
      } else if (urlConvId) {
        newConversation(agentId);
      } else if (convs.length > 0) {
        await switchConversation(agentId, convs[0].id);
      } else {
        newConversation(agentId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, agentId]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      wsClient.on<AgentMessage>("messages:created", (msg) => {
        if (msg.conversationId !== conversationId) return;
        if (msg.role === "tool" && msg.content === "") return;
        setMessages((prev) => {
          const filtered = prev.filter((m) => !(m.id.startsWith("optimistic-") && m.role === msg.role && m.content === msg.content));
          return [...filtered, msg];
        });
        if (msg.role === "user" && agentId) {
          refreshConversations(agentId);
        }
      }),
    );

    unsubs.push(
      wsClient.on<AgentMessage>("messages:updated", (msg) => {
        if (msg.conversationId !== conversationId) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [conversationId, agentId, setMessages]);

  const verifyPassword = async (password: string) => {
    if (!password || !agent) return;

    setEnteredPassword(password);
    setVerifying(true);
    setAuthError("");

    try {
      const res = await fetch(`/api/public/agents/${agent.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.valid) {
        if (data.token) localStorage.setItem(`public_auth_${agent.id}`, data.token);
        setIsAuthenticated(true);
      } else {
        setAuthError(data.message || "Incorrect password");
      }
    } catch {
      setAuthError("Connection error.");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    return wsClient.on<{ id: string; status: string }>("conversations:updated", (payload) => {
      if (payload.status === "running") {
        markProcessing(payload.id);
      } else {
        unmarkProcessing(payload.id);
      }
    });
  }, [markProcessing, unmarkProcessing]);

  useEffect(() => {
    const runningIds = new Set(conversations.filter((c) => c.status === "running").map((c) => c.id));
    setProcessingConvIds((prev) => {
      const isSame = prev.size === runningIds.size && [...runningIds].every((id) => prev.has(id));
      return isSame ? prev : runningIds;
    });
  }, [conversations]);

  const handleCancel = useCallback(() => {
    if (conversationId) markTerminal(conversationId);
    cancel();
  }, [cancel, conversationId, markTerminal]);

  const handleSend = async (text: string) => {
    if (!agent || running) return;

    let convId = conversationId;

    if (!convId) {
      const fp = getFingerprint();
      const res = await fetch(`/api/public/agents/${agent.id}/conversations?fp=${fp}`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = await res.json();
      convId = data.conversationId;
      if (!convId) return;
      setConversationId(convId);
      navigate(`/chat/${agent.id}?conv=${convId}`, { replace: true });
      await refreshConversations(agent.id);
    }

    const optimisticMsg: any = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      conversationId: convId,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    clearStreamingState();
    scrollToBottom({ force: true });

    const mockAgent: any = { id: agent.id, name: agent.name };

    markProcessing(convId);

    const savedToken = localStorage.getItem(`public_auth_${agent.id}`) ?? undefined;

    const callbacks = buildSSECallbacks(convId);
    run({
      agent: mockAgent,
      conversationId: convId,
      userMessage: text,
      password: enteredPassword || undefined,
      token: savedToken,
      fingerprint: getFingerprint(),
      ...callbacks,
    });
  };

  if (loading) return <LoadingScreen />;

  if (error) return <ErrorScreen error={error} />;

  if (!isAuthenticated && agent?.requiresPassword) {
    return <PasswordGate agentName={agent.name} onSubmit={verifyPassword} authError={authError} verifying={verifying} />;
  }

  if (!agent) return <ErrorScreen error="Agent unavailable" />;

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-background"
      style={{
        fontFamily: "var(--font-family-chat)",
        userSelect: isResizing ? "none" : undefined,
        cursor: isResizing ? "col-resize" : undefined,
      }}
    >
      {sidebarOpen && (
        <>
          <ChatSidebar
            agent={agent}
            width={sidebarWidth}
            conversations={conversations}
            conversationId={conversationId}
            processingConvIds={processingConvIds}
            onCloseSidebar={() => setSidebarOpen(false)}
            onNewConversation={() => agentId && newConversation(agentId)}
            onSwitchConversation={(convId) => agentId && switchConversation(agentId, convId)}
            onDeleteConversation={(convId) => agentId && deleteConversation(agentId, convId)}
          />
          <div onMouseDown={onResizeStart} className={["w-px shrink-0 h-full cursor-col-resize z-10 transition-colors duration-150", isResizing ? "bg-primary/50" : "bg-border hover:bg-primary/40"].join(" ")} />
        </>
      )}

      <div className="@container relative flex flex-col flex-1 min-w-0 h-full bg-popover">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{
            background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
          }}
        />

        {!sidebarOpen && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5">
            <button type="button" onClick={() => setSidebarOpen(true)} className="flex items-center justify-center size-8 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors" aria-label="Open sidebar" title="Open sidebar">
              <SidebarMinimalisticIcon size={16} />
            </button>
            <button type="button" onClick={() => agentId && newConversation(agentId)} className="flex items-center justify-center size-8 rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors" aria-label="New chat" title="New chat">
              <PenNewSquareIcon size={15} />
            </button>
          </div>
        )}

        <div className={["relative flex-1 min-h-0 flex flex-col", !sidebarOpen ? "@max-[900px]:pt-10" : ""].join(" ")}>
          <MessageList
            messages={liveMessages}
            generating={running}
            activityStatus={activityStatus}
            assistantLabel={agent.name}
            emptyStateContent={<ChatEmptyState agent={agent} onStarter={(text) => void handleSend(text)} disabled={running} />}
            messagesEndRef={messagesEndRef}
            scrollContainerRef={scrollRef}
            pinToBottom={!isScrolledUp}
            padEnd
          />
          {isScrolledUp && (
            <button
              type="button"
              onClick={() => scrollToBottom({ force: true })}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center size-8 rounded-full border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Scroll to bottom"
            >
              <AltArrowDownIcon size={14} />
            </button>
          )}
        </div>

        <div className="relative shrink-0 w-full max-w-190 mx-auto">
          <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-linear-to-t from-popover to-transparent" />
          <InputArea placeholder={`Message ${agent.name}...`} generating={running} onSend={handleSend} onCancel={handleCancel} hideConfig autoFocus focusSignal={conversationId} />
        </div>
      </div>
    </div>
  );
}
