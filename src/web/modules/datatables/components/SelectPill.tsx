import { cn } from "src/common/lib/cn";

const SELECT_PILLS = [
  { bg: "color-mix(in oklab, #dd7627 18%, transparent)", fg: "#ffa333" },
  { bg: "color-mix(in oklab, #599ce7 18%, transparent)", fg: "#7eb3ef" },
  { bg: "color-mix(in oklab, #0ac864 16%, transparent)", fg: "#3dd87a" },
  { bg: "color-mix(in oklab, #f1b467 18%, transparent)", fg: "#f1b467" },
  { bg: "color-mix(in oklab, #fc7744 16%, transparent)", fg: "#fc9468" },
  { bg: "color-mix(in oklab, #a78bfa 16%, transparent)", fg: "#c4b5fd" },
] as const;

function hashHue(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h % SELECT_PILLS.length;
}

export function SelectPill({ value, className }: { value: string; className?: string }) {
  const pill = SELECT_PILLS[hashHue(value)]!;
  return (
    <span className={cn("inline-flex max-w-full truncate rounded-sm px-1.5 py-0.5 text-[12px] font-medium leading-4", className)} style={{ backgroundColor: pill.bg, color: pill.fg }}>
      {value}
    </span>
  );
}
