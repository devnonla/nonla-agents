import { cn } from "../../lib/cn";
import type { IFormItemHelpProps } from "../common/types";

function FormItemHelp({ text, className }: IFormItemHelpProps) {
  return (
    <div className={cn("flex flex-row items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="mt-0.5 shrink-0 text-warning">
        <path d="M6 1.5L10.5 10H1.5L6 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 5V7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="6" cy="8.6" r="0.6" fill="currentColor" />
      </svg>
      <div>{text}</div>
    </div>
  );
}

export type FormItemHelpsProps = {
  className?: string;
  items?: IFormItemHelpProps[];
};

export function FormItemHelps({ items, className }: FormItemHelpsProps) {
  if (!items?.length) return null;
  return (
    <div className={cn("mt-1 flex flex-col gap-1 pl-2.75", className)}>
      {items.map((item, index) => (
        <FormItemHelp key={`${index}-${item.text}`} text={item.text} className={item.className} iconClassName={item.iconClassName} />
      ))}
    </div>
  );
}
