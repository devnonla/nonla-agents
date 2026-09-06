import { chatMarkdownComponents } from "@nonla-agents/ui";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const previewRootClass =
  "wrap-break-word text-[15px] leading-7 text-foreground " +
  "[&_p]:m-0 [&_p]:mb-4 [&_p:last-child]:mb-0 " +
  "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-[22px] [&_h1]:font-semibold [&_h1]:leading-8 " +
  "[&_h2]:mt-7 [&_h2]:mb-2.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-7 " +
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 " +
  "[&_h4]:mt-5 [&_h4]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold " +
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_blockquote]:m-0 [&_blockquote]:mb-4 [&_blockquote]:border-0 [&_blockquote]:p-0 [&_blockquote]:not-italic [&_blockquote]:text-inherit [&_blockquote:last-child]:mb-0 " +
  "[&_ul]:mt-2 [&_ul]:mb-4 [&_ul:not(.contains-task-list)]:list-disc [&_ul:not(.contains-task-list)]:pl-6 " +
  "[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0 " +
  "[&_ol]:mt-2 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1.5 [&_li]:leading-7 " +
  "[&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 " +
  "[&_li.task-list-item>input]:mt-1.5 [&_li.task-list-item>input]:size-3.5 [&_li.task-list-item>input]:shrink-0 [&_li.task-list-item>input]:accent-brand " +
  "[&_a]:text-link [&_a]:no-underline [&_a]:hover:underline [&_a]:hover:underline-offset-[3px]";

const previewComponents = {
  ...chatMarkdownComponents,
  hr() {
    return <hr className="my-6 border-border" />;
  },
};

interface MarkdownPreviewProps {
  content: string;
  empty?: ReactNode;
}

export function MarkdownPreview({ content, empty }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return empty ?? <p className="m-0 text-sm text-muted-foreground">This file is empty.</p>;
  }

  return (
    <div className={previewRootClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
