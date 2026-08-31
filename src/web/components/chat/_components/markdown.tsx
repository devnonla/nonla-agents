import type { Components } from "react-markdown";
import { isPendingMermaidBlock } from "../common/hasUnclosedMermaidFence";
import { CodeBlock } from "./CodeBlock";
import { MarkdownTable } from "./MarkdownTable";

/** Message body — sizes come from --chat-* tokens (compact default, .chat-size-lg on full-page chat). */
export const chatBodyClass = "font-family-chat font-normal text-[#ececec] antialiased text-(length:--chat-body-size) leading-(--chat-body-leading)";

/** Shared Tailwind prose classes for chat markdown (no CSS file). */
export const markdownRootClass = `${chatBodyClass} min-w-0 wrap-anywhere [&_p]:m-0 [&_p]:mb-(--chat-p-mb) [&_p:last-child]:mb-0 [&_h1]:mt-(--chat-h-mt) [&_h1]:mb-(--chat-h-mb) [&_h1]:text-(length:--chat-h1-size) [&_h1]:font-semibold [&_h1]:leading-snug [&_h2]:mt-(--chat-h-mt) [&_h2]:mb-(--chat-h-mb) [&_h2]:text-(length:--chat-h2-size) [&_h2]:font-semibold [&_h2]:leading-snug [&_h3]:mt-(--chat-h-mt) [&_h3]:mb-(--chat-h-mb) [&_h3]:text-(length:--chat-h3-size) [&_h3]:font-semibold [&_h3]:leading-snug [&_h4]:mt-(--chat-h-mt) [&_h4]:mb-(--chat-h-mb) [&_h4]:text-(length:--chat-h4-size) [&_h4]:font-semibold [&_h4]:leading-snug [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:py-0.5 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-tertiary-foreground [&_ul]:mt-2 [&_ul]:mb-(--chat-p-mb) [&_ul]:list-disc [&_ul]:pl-[26px] [&_ol]:mt-2 [&_ol]:mb-(--chat-p-mb) [&_ol]:list-decimal [&_ol]:pl-[26px] [&_li]:my-1.5 [&_li]:leading-(--chat-body-leading) [&_a]:text-link [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-link/40 hover:[&_a]:decoration-link/70`;

export type MarkdownStreamState = {
  content: string;
  streaming: boolean;
};

/**
 * Build markdown components. Pass getState so pending-mermaid can update via ref
 * without recreating the components object (avoids remounting finished charts).
 */
export function createMarkdownComponents(getState?: () => MarkdownStreamState): Components {
  return {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1] ?? "";
      const codeText = String(children).replace(/\n$/, "");
      const isBlock = codeText.includes("\n") || !!match;

      if (isBlock) {
        const state = getState?.();
        const pendingMermaid = lang.toLowerCase() === "mermaid" && state ? isPendingMermaidBlock(state.content, codeText, state.streaming) : false;

        return (
          <CodeBlock language={lang} pendingMermaid={pendingMermaid}>
            {codeText}
          </CodeBlock>
        );
      }

      return (
        <span className="inline whitespace-pre-wrap break-all rounded-sm bg-white/10 px-1 py-0 text-(length:--chat-inline-code-size) leading-5 [box-decoration-break:clone]" {...props}>
          {children}
        </span>
      );
    },
    hr() {
      return null;
    },
    table({ children }) {
      return <MarkdownTable>{children}</MarkdownTable>;
    },
    th({ children }) {
      return (
        <th>
          <div className="max-w-150 wrap-break-word">{children}</div>
        </th>
      );
    },
    td({ children }) {
      return (
        <td>
          <div className="max-w-150 wrap-break-word">{children}</div>
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

export const markdownComponents: Components = createMarkdownComponents();
