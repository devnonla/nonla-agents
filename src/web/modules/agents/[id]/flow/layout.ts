// ─── Flow layout helpers ──────────────────────────────────────────────────────
// Vertical packing for the right-hand column so parent cards and their fan-out
// children never overlap neighboring sections.

export type FanoutSectionLayout = {
  /** Y of the parent card */
  parentY: number;
  /** Y of the first fan-out child (centered on parent). 0 when no children. */
  childTop: number;
  /** Bottom edge of this section (parent or children, whichever is lower) */
  sectionBottom: number;
  /** Total vertical span of the child stack (0 when empty) */
  stackH: number;
};

/** Height of a vertical stack of `count` cards spaced by `gapY`. */
export function stackHeight(count: number, gapY: number, itemH: number): number {
  if (count <= 0) return 0;
  return itemH + (count - 1) * gapY;
}

/**
 * Place a parent card + optional fan-out children starting at `startY`.
 * Children are vertically centered on the parent. If the stack is taller than
 * the parent, the parent is pushed down so the whole section still starts at
 * `startY` (children won't bleed above the section top into the previous one).
 */
export function layoutFanoutSection(startY: number, parentH: number, childCount: number, childGapY: number, childH: number): FanoutSectionLayout {
  const stackH = stackHeight(childCount, childGapY, childH);

  let parentY: number;
  if (childCount === 0 || stackH <= parentH) {
    parentY = startY;
  } else {
    // Center parent inside the taller child stack so section top == startY
    parentY = startY + (stackH - parentH) / 2;
  }

  const childTop = childCount > 0 ? parentY + parentH / 2 - stackH / 2 : startY;
  const sectionBottom = Math.max(parentY + parentH, childCount > 0 ? childTop + stackH : parentY + parentH);

  return { parentY, childTop, sectionBottom, stackH };
}

export type TwoLevelBranchLayout = {
  /** Y of the mid-level node (e.g. MCP server) */
  midY: number;
  /** Y of the first leaf under this mid node */
  leafTop: number;
  /** Height of the leaf stack (0 when empty) */
  stackH: number;
};

export type TwoLevelFanoutLayout = {
  rootY: number;
  branches: TwoLevelBranchLayout[];
  sectionBottom: number;
  sectionHeight: number;
};

/**
 * Two-level fan-out: root → mid nodes → leaf stacks.
 * Used by MCP: MCP Servers → server cards → tool cards.
 *
 * Branches are packed top→bottom; each mid node is vertically centered on its
 * own leaf stack. The root is centered on the full branch column. The whole
 * block starts at `startY` so it won't bleed into the previous section.
 */
export function layoutTwoLevelFanout(startY: number, rootH: number, branchChildCounts: readonly number[], midH: number, leafGapY: number, leafH: number, branchGap: number): TwoLevelFanoutLayout {
  if (branchChildCounts.length === 0) {
    return { rootY: startY, branches: [], sectionBottom: startY + rootH, sectionHeight: rootH };
  }

  const metas = branchChildCounts.map((n) => {
    const stackH = n > 0 ? stackHeight(n, leafGapY, leafH) : 0;
    const bandH = Math.max(midH, stackH || midH);
    return { n, stackH, bandH };
  });

  const contentH = metas.reduce((sum, m) => sum + m.bandH, 0) + Math.max(0, metas.length - 1) * branchGap;

  let contentTop: number;
  let rootY: number;
  if (contentH <= rootH) {
    rootY = startY;
    contentTop = startY + (rootH - contentH) / 2;
  } else {
    contentTop = startY;
    rootY = startY + (contentH - rootH) / 2;
  }

  let cursor = contentTop;
  const branches: TwoLevelBranchLayout[] = [];
  for (const m of metas) {
    const midY = cursor + (m.bandH - midH) / 2;
    const leafTop = m.n > 0 ? cursor + (m.bandH - m.stackH) / 2 : cursor;
    branches.push({ midY, leafTop, stackH: m.stackH });
    cursor += m.bandH + branchGap;
  }

  const sectionBottom = Math.max(rootY + rootH, contentTop + contentH);
  return {
    rootY,
    branches,
    sectionBottom,
    sectionHeight: sectionBottom - startY,
  };
}

/**
 * Resolve ideal tops of independent vertical stacks so none overlap.
 * Stacks are processed top-to-bottom; later ones are pushed down if needed.
 * Returns a new array of resolved tops (same order as input).
 */
export function resolveVerticalCollisions(stacks: ReadonlyArray<{ top: number; height: number }>, minGap: number): number[] {
  if (stacks.length === 0) return [];

  const order = stacks.map((s, i) => ({ i, top: s.top, height: s.height })).sort((a, b) => a.top - b.top || a.i - b.i);

  const resolved = new Array<number>(stacks.length);
  let prevBottom = Number.NEGATIVE_INFINITY;

  for (const s of order) {
    const top = Number.isFinite(prevBottom) ? Math.max(s.top, prevBottom + minGap) : s.top;
    resolved[s.i] = top;
    prevBottom = top + s.height;
  }

  return resolved;
}

/**
 * Measure child card width from labels + fixed chrome, floored to `minWidth`.
 */
export function measureChildWidth(labels: string[], chrome: number, minWidth: number, measure: (texts: string[]) => number): number {
  if (labels.length === 0) return minWidth;
  return Math.max(minWidth, Math.ceil(measure(labels) + chrome));
}
