import { cn } from "src/common/lib/cn";

const SELECT_PILLS = ["#cd6338", "#466edf", "#319075", "#b27e34", "#ca5d43", "#874fe0"] as const;

function hashHue(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h % SELECT_PILLS.length;
}

export function SelectPill({ value, className }: { value: string; className?: string }) {
  const bg = SELECT_PILLS[hashHue(value)]!;
  return (
    <span className={cn("inline-flex max-w-full truncate rounded-sm px-1.5 py-0.5 text-[12px] font-medium leading-4 text-white", className)} style={{ backgroundColor: bg }}>
      {value}
    </span>
  );
}
