import type { ReactNode, Ref, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppLogo } from "src/components/AppLogo"; // used in empty state
import { MessageBubble } from "./MessageBubble";
import { ToolCallBubble } from "./ToolCallBubble";

import RenderIf from "src/components/RenderIf";
import type { ChatAgentMessage } from "../common/types";
import { isCallAgentToolName } from "../common/utils";

interface MessageListProps {
  messages: ChatAgentMessage[];
  generating: boolean;
  /** Contextual activity status text (e.g. 'Running Browser...') */
  activityStatus?: string;
  assistantLabel?: string;
  assistantColor?: string | null;
  emptyStateContent?: ReactNode;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: Ref<HTMLDivElement | null>;
  /** When true, keep the scroller glued to bottom across message/stream updates. */
  pinToBottom?: boolean;
  /** Extra space under the last message so it isn't flush with the composer. */
  padEnd?: boolean;
  className?: string;
}

// ─── Render item types ────────────────────────────────────────────────────────

/** Single message render item */
type SingleItem = {
  kind: "single";
  msg: ChatAgentMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  /** Show avatar — true only on the first agent-side message in a consecutive chain */
  showAvatar: boolean;
};

export type RenderItem = SingleItem;

// Flat render item — for backward compat
type FlatRenderItem = {
  msg: ChatAgentMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAgentRole(role: ChatAgentMessage["role"]): boolean {
  return role !== "user";
}

/** True if the previous message is a call_agent tool-call (context switch back to parent) */
function prevIsCallAgent(msg: ChatAgentMessage | null): boolean {
  return msg?.role === "tool-call" && isCallAgentToolName(msg?.toolName);
}

function isSameSender(a: ChatAgentMessage, b: ChatAgentMessage): boolean {
  if (a.role === "tool-call" || b.role === "tool-call") return false;
  return a.role === b.role;
}

// ─── Build render items — flat, no grouping ───────────────────────────────────

export function buildRenderItems(messages: ChatAgentMessage[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const isFirstInGroup = !prev || !isSameSender(prev, msg);
    const isLastInGroup = !next || !isSameSender(msg, next);
    const isAgent = isAgentRole(msg.role);
    const prevIsAgent = prev ? isAgentRole(prev.role) : false;
    const showAvatar = isAgent && (!prevIsAgent || prevIsCallAgent(prev));

    items.push({ kind: "single", msg, isFirstInGroup, isLastInGroup, showAvatar });
  }

  return items;
}

/** @deprecated kept for backward compat; flattens to old format */
export function groupMessages(messages: ChatAgentMessage[]): FlatRenderItem[] {
  const items: FlatRenderItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const isFirstInGroup = !prev || !isSameSender(prev, msg);
    const isLastInGroup = !next || !isSameSender(msg, next);
    const isAgent = isAgentRole(msg.role);
    const prevIsAgent = prev ? isAgentRole(prev.role) : false;
    const showAvatar = isAgent && !prevIsAgent;
    items.push({ msg, isFirstInGroup, isLastInGroup, showAvatar });
  }
  return items;
}

export function MessageList({ messages, generating, activityStatus = "Working", assistantLabel = "Assistant", assistantColor, emptyStateContent, messagesEndRef, scrollContainerRef, pinToBottom = false, padEnd = false, className = "" }: MessageListProps) {
  const hasMessages = messages.length > 0;
  const items = buildRenderItems(messages);
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsAgent = lastMsg ? isAgentRole(lastMsg.role) : false;
  const hasActiveThinking = lastMsg?.role === "assistant" && Boolean(lastMsg.meta?.thinking) && lastMsg.meta?.thinkingDuration == null;
  const isLiveText = activityStatus === "Writing..." || (lastMsg?.role === "assistant" && Boolean(lastMsg.streaming) && Boolean(lastMsg.content));
  const contentFingerprint = messages.reduce((n, m) => n + (m.role === "assistant" ? m.content.length : 0), 0);

  const [streamIdle, setStreamIdle] = useState(true);
  useEffect(() => {
    if (!generating || !isLiveText) {
      setStreamIdle(true);
      return;
    }
    setStreamIdle(false);
    const id = window.setTimeout(() => setStreamIdle(true), 600);
    return () => window.clearTimeout(id);
  }, [generating, isLiveText, contentFingerprint]);

  const showFooter = generating && !hasActiveThinking && (!isLiveText || streamIdle);

  const localScrollRef = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      localScrollRef.current = node;
      if (typeof scrollContainerRef === "function") {
        scrollContainerRef(node);
      } else if (scrollContainerRef && "current" in scrollContainerRef) {
        scrollContainerRef.current = node;
      }
    },
    [scrollContainerRef],
  );

  // Stream fingerprint — content of the live bubble changes without length changing.
  const streamFingerprint = lastMsg ? `${lastMsg.id}:${lastMsg.content.length}` : "";

  useLayoutEffect(() => {
    if (!pinToBottom) return;
    const el = localScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [pinToBottom, messages.length, streamFingerprint, showFooter, activityStatus]);

  // Elapsed seconds while generating so long "Thinking..."waits don't look frozen
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!showFooter) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [showFooter, activityStatus]);

  const statusLabel = elapsedSec >= 3 ? `${activityStatus} ${elapsedSec}s` : activityStatus;

  return (
    <div ref={setScrollRef} className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden [overflow-anchor:none] ${!hasMessages ? "flex flex-col" : ""}`}>
      <div className={`max-w-190 mx-auto min-w-0 w-full [overflow-anchor:none] ${!hasMessages ? "flex-1 flex flex-col" : ""} ${className}`}>
        <RenderIf condition={!hasMessages}>
          <div className="flex flex-1 flex-col items-stretch min-h-full w-full">
            {emptyStateContent ?? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
                <AppLogo size={36} />
                <p className="text-xs text-muted-foreground leading-relaxed max-w-50 m-0">Send a message to start chatting with this agent.</p>
              </div>
            )}
          </div>
        </RenderIf>

        <RenderIf condition={hasMessages}>
          <div data-chat-scroll-content className={`pt-4 flex flex-col ${padEnd ? "pb-75" : "pb-4"}`}>
            {items.map((item) =>
              item.msg.role === "tool-call" ? (
                <ToolCallBubble key={item.msg.id} msg={item.msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={item.showAvatar} />
              ) : (
                <MessageBubble key={item.msg.id} msg={item.msg} assistantLabel={assistantLabel} assistantColor={assistantColor} isFirstInGroup={item.isFirstInGroup} isLastInGroup={item.isLastInGroup} isFirstInAgentChain={item.showAvatar} />
              ),
            )}

            {/* Thinking / generating indicator */}
            <RenderIf condition={showFooter}>
              <div className="animate-fadeIn mt-1">
                <RenderIf condition={!lastIsAgent}>
                  <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: assistantColor ?? "var(--primary)", color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
                      {assistantLabel}
                    </span>
                  </div>
                </RenderIf>
                <div className="px-4 pb-0.5">
                  <div className="flex items-center min-h-7">
                    <span className="text-(length:--chat-body-size) leading-5.5 font-medium font-family-chat text-tertiary-foreground antialiased ca-status-shimmer">{statusLabel}</span>
                  </div>
                </div>
              </div>
            </RenderIf>

            <div ref={messagesEndRef} />
          </div>
        </RenderIf>
      </div>
    </div>
  );
}
