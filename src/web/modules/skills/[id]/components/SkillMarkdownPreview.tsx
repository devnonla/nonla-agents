import { useMemo } from "react";
import type { Components } from "react-markdown";
import { MarkdownPreview } from "src/components/MarkdownPreview";
import { parseSkillFrontmatter } from "../../common/frontmatter";

interface SkillMarkdownPreviewProps {
  content: string;
  showFrontmatter?: boolean;
  filePaths?: string[];
  onOpenFile?: (path: string) => void;
}

function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

function parseSkillFileHref(href: string): string | null {
  const raw = href.trim();
  if (!raw || isExternalHref(raw) || raw.startsWith("#")) return null;

  let path = raw.split(/[?#]/, 1)[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replaceAll("\\", "/");
  while (path.startsWith("./")) path = path.slice(2);
  if (path.startsWith("/")) path = path.replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  return path;
}

export function SkillMarkdownPreview({ content, showFrontmatter = false, filePaths, onOpenFile }: SkillMarkdownPreviewProps) {
  const parsed = showFrontmatter ? parseSkillFrontmatter(content) : { frontmatter: {}, body: content, hasFrontmatter: false };
  const name = parsed.frontmatter.name?.trim();
  const description = parsed.frontmatter.description?.trim();
  const body = parsed.hasFrontmatter ? parsed.body : content;
  const pathSet = useMemo(() => new Set(filePaths), [filePaths]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children, ...props }) {
        if (!href || isExternalHref(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        }

        const path = parseSkillFileHref(href);
        if (path && pathSet.has(path) && onOpenFile) {
          return (
            <button type="button" className="inline cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-link hover:underline hover:underline-offset-[3px]" onClick={() => onOpenFile(path)}>
              {children}
            </button>
          );
        }

        return <span>{children}</span>;
      },
    }),
    [onOpenFile, pathSet],
  );

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-8">
      {parsed.hasFrontmatter ? (
        <header className="mb-8 border-b border-border pb-6">
          {name ? <h1 className="m-0 text-[22px] font-semibold leading-8 text-foreground">{name}</h1> : null}
          {description ? <p className="m-0 mt-2 text-[15px] leading-6 text-muted-foreground">{description}</p> : null}
        </header>
      ) : null}
      <MarkdownPreview content={body} components={components} />
    </article>
  );
}
