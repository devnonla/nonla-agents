interface SectionRowProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function SectionRow({ title, description, children }: SectionRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6 md:gap-12 py-8">
      <div className="shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
