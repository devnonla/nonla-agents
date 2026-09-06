import { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "../codeblock/CodeBlock";
import { cn } from "../lib/cn";
import { ChatMarkdownTable } from "./ChatMarkdownTable";
import { MermaidBlock } from "./MermaidBlock";
import { isPendingMermaidBlock } from "./mermaidFence";

/** Message body — sizes come from --chat-* tokens. */
export const chatBodyClass = "font-normal text-foreground antialiased text-(length:--chat-body-size) leading-(--chat-body-leading)";

/** Shared Tailwind prose classes for chat markdown. */
export const chatMarkdownClass = `${chatBodyClass} min-w-0 wrap-anywhere [&_p]:m-0 [&_p]:mb-(--chat-p-mb) [&_p:last-child]:mb-0 [&_h1]:mt-(--chat-h-mt) [&_h1]:mb-(--chat-h-mb) [&_h1]:text-(length:--chat-h1-size) [&_h1]:font-semibold [&_h1]:leading-snug [&_h2]:mt-(--chat-h-mt) [&_h2]:mb-(--chat-h-mb) [&_h2]:text-(length:--chat-h2-size) [&_h2]:font-semibold [&_h2]:leading-snug [&_h3]:mt-(--chat-h-mt) [&_h3]:mb-(--chat-h-mb) [&_h3]:text-(length:--chat-h3-size) [&_h3]:font-semibold [&_h3]:leading-snug [&_h4]:mt-(--chat-h-mt) [&_h4]:mb-(--chat-h-mb) [&_h4]:text-(length:--chat-h4-size) [&_h4]:font-semibold [&_h4]:leading-snug [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:m-0 [&_blockquote]:mb-(--chat-p-mb) [&_blockquote]:border-0 [&_blockquote]:p-0 [&_blockquote]:not-italic [&_blockquote]:text-inherit [&_blockquote:last-child]:mb-0 [&_ul]:mt-2 [&_ul]:mb-(--chat-p-mb) [&_ul]:list-disc [&_ul]:pl-[26px] [&_ol]:mt-2 [&_ol]:mb-(--chat-p-mb) [&_ol]:list-decimal [&_ol]:pl-[26px] [&_li]:my-1.5 [&_li]:leading-(--chat-body-leading) [&_a]:text-link [&_a]:no-underline [&_a]:hover:underline [&_a]:hover:underline-offset-[3px]`;

export type ChatMarkdownStreamState = {
  content: string;
  streaming: boolean;
};

export type ChatMarkdownProps = {
  content: string;
  streaming?: boolean;
  className?: string;
};

/**
 * Build markdown components. Pass getState so pending-mermaid can update via ref
 * without recreating the components object (avoids remounting finished charts).
 */
export function createChatMarkdownComponents(getState?: () => ChatMarkdownStreamState): Components {
  return {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1] ?? "";
      const codeText = String(children).replace(/\n$/, "");
      const isBlock = codeText.includes("\n") || !!match;

      if (isBlock) {
        const isMermaid = lang.toLowerCase() === "mermaid";
        if (isMermaid) {
          const state = getState?.();
          const pending = state ? isPendingMermaidBlock(state.content, codeText, state.streaming) : false;
          if (!pending) return <MermaidBlock>{codeText}</MermaidBlock>;
        }

        return <CodeBlock code={codeText} language={lang || undefined} className="last:mb-0" />;
      }

      return (
        <span className="inline whitespace-pre-wrap break-all rounded-sm bg-muted px-1 py-0 text-(length:--chat-inline-code-size) leading-5 [box-decoration-break:clone]" {...props}>
          {children}
        </span>
      );
    },
    hr() {
      return null;
    },
    table({ children }) {
      return <ChatMarkdownTable>{children}</ChatMarkdownTable>;
    },
    th({ children }) {
      return (
        <th>
          <div className="inline-block max-w-[300px] wrap-break-word">{children}</div>
        </th>
      );
    },
    td({ children }) {
      return (
        <td>
          <div className="inline-block max-w-[300px] wrap-break-word">{children}</div>
        </td>
      );
    },
    a({ href, children, ...props }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
  };
}

export const chatMarkdownComponents: Components = createChatMarkdownComponents();

export function ChatMarkdown({ content, streaming = false, className }: ChatMarkdownProps) {
  const streamStateRef = useRef<ChatMarkdownStreamState>({ content, streaming });
  streamStateRef.current = { content, streaming };

  const componentsRef = useRef<Components | null>(null);
  if (!componentsRef.current) {
    componentsRef.current = createChatMarkdownComponents(() => streamStateRef.current);
  }

  return (
    <div className={cn(chatMarkdownClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsRef.current}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
