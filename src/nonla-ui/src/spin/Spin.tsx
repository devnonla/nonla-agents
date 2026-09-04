import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { type ControlSize, getSizeTokens } from "../lib/sizes";

export type SpinVariant = "default" | "agent" | "subAgent";

export type SpinProps = {
  spinning?: boolean;
  tip?: ReactNode;
  size?: ControlSize;
  /** Visual style — agent / subAgent for AI run states. */
  variant?: SpinVariant;
  /** Replace the built-in indicator entirely. */
  indicator?: ReactNode;
  children?: ReactNode;
  className?: string;
};

function dimFor(size: ControlSize | undefined) {
  return Math.round(getSizeTokens(size).icon * 1.25);
}

function DefaultSpinner({ size }: { size: ControlSize | undefined }) {
  const dim = dimFor(size);
  return (
    <span
      className="inline-block rounded-full border-2 border-current/25 border-t-current animate-spin text-brand"
      style={{ width: dim, height: dim }}
      aria-hidden
    />
  );
}

type Cell = number; // 0..8 on a 3×3 grid
/** Snake = [head, mid, tail] — always 3 orthogonally adjacent cells. */
type Snake = [Cell, Cell, Cell];

const NEIGHBORS: Record<number, number[]> = {
  0: [1, 3],
  1: [0, 2, 4],
  2: [1, 5],
  3: [0, 4, 6],
  4: [1, 3, 5, 7],
  5: [2, 4, 8],
  6: [3, 7],
  7: [4, 6, 8],
  8: [5, 7],
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomSnake(): Snake {
  const head = Math.floor(Math.random() * 9);
  const mid = pick(NEIGHBORS[head]!);
  const tail = pick(NEIGHBORS[mid]!.filter((c) => c !== head && c !== mid));
  return [head, mid, tail];
}

/** Step the snake: head walks to a random free neighbor; body follows. */
function stepSnake(snake: Snake): Snake {
  const [head, mid, tail] = snake;
  let nextHeads = NEIGHBORS[head]!.filter((c) => c !== mid);
  if (nextHeads.length === 0) {
    // Dead-end — reverse direction from current pose.
    return [tail, mid, head];
  }
  // Bias away from immediately reversing into the tail when other choices exist.
  const forward = nextHeads.filter((c) => c !== tail);
  if (forward.length) nextHeads = forward;
  const next = pick(nextHeads);
  return [next, head, mid];
}

/** 3×3 fixed dots — 3 adjacent lit cells crawl randomly (snake). */
function MatrixSnake({ size, tickMs = 220 }: { size: ControlSize | undefined; tickMs?: number }) {
  const scale = getSizeTokens(size).icon / 16;
  const cell = Math.max(4, Math.round(5 * scale));
  const gap = Math.max(2, Math.round(2 * scale));
  const dim = cell * 3 + gap * 2;
  const [snake, setSnake] = useState<Snake>(() => randomSnake());

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => setSnake((s) => stepSnake(s)), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  const lit = new Set(snake);

  return (
    <span
      className="nonla-spin-matrix inline-grid"
      style={{
        width: dim,
        height: dim,
        gridTemplateColumns: `repeat(3, ${cell}px)`,
        gridTemplateRows: `repeat(3, ${cell}px)`,
        gap,
      }}
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={`c${i % 3}-r${Math.floor(i / 3)}`} className={cn("nonla-spin-matrix-cell", lit.has(i) && "is-on")} />
      ))}
    </span>
  );
}

function AgentSpinner({ size }: { size: ControlSize | undefined }) {
  return <MatrixSnake size={size} tickMs={240} />;
}

function SubAgentSpinner({ size }: { size: ControlSize | undefined }) {
  return <MatrixSnake size={size} tickMs={180} />;
}

function Spinner({ size, variant }: { size: ControlSize | undefined; variant: SpinVariant }) {
  if (variant === "agent") return <AgentSpinner size={size} />;
  if (variant === "subAgent") return <SubAgentSpinner size={size} />;
  return <DefaultSpinner size={size} />;
}

function Indicator({
  size,
  variant,
  indicator,
}: {
  size: ControlSize | undefined;
  variant: SpinVariant;
  indicator?: ReactNode;
}) {
  if (indicator != null) return <>{indicator}</>;
  return <Spinner size={size} variant={variant} />;
}

export function Spin({ spinning = true, tip, size, variant = "default", indicator, children, className }: SpinProps) {
  if (children == null) {
    return (
      <div className={cn("inline-flex flex-col items-center gap-2", className)} role={spinning ? "status" : undefined} aria-live={spinning ? "polite" : undefined}>
        {spinning ? <Indicator size={size} variant={variant} indicator={indicator} /> : null}
        {tip ? <span className="text-xs text-muted-foreground">{tip}</span> : null}
      </div>
    );
  }
  return (
    <div className={cn("relative", className)}>
      {children}
      {spinning ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/50" role="status" aria-live="polite">
          <Indicator size={size} variant={variant} indicator={indicator} />
          {tip ? <span className="text-xs text-muted-foreground">{tip}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
