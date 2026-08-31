import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export type HtmlOutputMode = "html" | "md";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

function stripBoilerplate(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
}

function extractMainHtml(html: string, url?: string): { html: string; title?: string } {
  const cleaned = stripBoilerplate(html);
  try {
    const { document } = parseHTML(cleaned);
    if (url) {
      try {
        const base = document.createElement("base");
        base.setAttribute("href", url);
        document.head?.appendChild(base);
      } catch {
        /* ignore */
      }
    }
    const article = new Readability(document as unknown as Document).parse();
    if (article?.content?.trim()) {
      return { html: article.content, title: article.title?.trim() || undefined };
    }
  } catch {
    /* fall through */
  }
  return { html: cleaned };
}

/** Convert page HTML into compact LLM-friendly html or markdown. */
export function htmlToLlmText(html: string, mode: HtmlOutputMode, url?: string): string {
  const { html: mainHtml, title } = extractMainHtml(html, url);
  if (mode === "html") {
    const body = mainHtml.trim();
    if (title && !body.toLowerCase().includes(title.toLowerCase())) {
      return `<h1>${title}</h1>\n${body}`;
    }
    return body;
  }
  const md = turndown.turndown(mainHtml).trim();
  if (title && !md.toLowerCase().includes(title.toLowerCase())) {
    return `# ${title}\n\n${md}`;
  }
  return md;
}
