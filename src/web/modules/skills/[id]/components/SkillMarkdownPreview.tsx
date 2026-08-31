import { MarkdownPreview } from "src/components/MarkdownPreview";
import { parseSkillFrontmatter } from "../../common/frontmatter";

interface SkillMarkdownPreviewProps {
  content: string;
  showFrontmatter?: boolean;
}

export function SkillMarkdownPreview({ content, showFrontmatter = false }: SkillMarkdownPreviewProps) {
  const parsed = showFrontmatter ? parseSkillFrontmatter(content) : { frontmatter: {}, body: content, hasFrontmatter: false };
  const name = parsed.frontmatter.name?.trim();
  const description = parsed.frontmatter.description?.trim();
  const body = parsed.hasFrontmatter ? parsed.body : content;

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-8">
      {parsed.hasFrontmatter ? (
        <header className="mb-8 border-b border-border pb-6">
          {name ? <h1 className="m-0 text-[22px] font-semibold leading-8 text-foreground">{name}</h1> : null}
          {description ? <p className="m-0 mt-2 text-[15px] leading-6 text-muted-foreground">{description}</p> : null}
        </header>
      ) : null}
      <MarkdownPreview content={body} />
    </article>
  );
}
