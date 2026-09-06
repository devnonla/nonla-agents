import { Button, Input, Switch } from "@nonla-agents/ui";
import { CheckCircleIcon } from "@solar-icons/react/dynamic/check-circle";
import { ClockCircleIcon } from "@solar-icons/react/dynamic/clock-circle";
import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { DangerTriangleIcon } from "@solar-icons/react/dynamic/danger-triangle";
import { InfoCircleIcon } from "@solar-icons/react/dynamic/info-circle";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PlayCircleIcon } from "@solar-icons/react/dynamic/play-circle";
import { StopCircleIcon } from "@solar-icons/react/dynamic/stop-circle";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { JobLogEntry, JobLogLevel, JobRun } from "src/common/types";
import { formatDayHeader, formatTimeOnly, getDayKey } from "src/common/utils/date";
import RenderIf from "src/components/RenderIf";

const TIMELINE_W = 240;

function statusIcon(status: JobRun["status"], size = 14) {
  if (status === "success") return <CheckCircleIcon size={size} className="text-success" weight="BoldDuotone" />;
  if (status === "failed") return <DangerCircleIcon size={size} className="text-destructive" weight="BoldDuotone" />;
  return <PlayCircleIcon size={size} className="animate-pulse text-brand-soft" weight="BoldDuotone" />;
}

function runListDuration(run: JobRun): string | null {
  if (run.status === "running" && !run.finishedAt) return null;
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return formatOffset(Math.max(0, end - start));
}

function normalizeLogs(logs: JobRun["logs"] | string | null | undefined): JobLogEntry[] {
  if (!logs) return [];
  if (Array.isArray(logs)) return logs;
  if (typeof logs === "string") {
    const trimmed = logs.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed as JobLogEntry[];
      } catch {
        /* plain text */
      }
    }
    return [{ t: 0, level: "info", message: logs }];
  }
  return [];
}

function formatOffset(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function levelIcon(level: JobLogLevel) {
  if (level === "error") return <CloseCircleIcon size={13} className="text-red-400" />;
  if (level === "warn") return <DangerTriangleIcon size={13} className="text-amber-400" />;
  if (level === "system") return <ClockCircleIcon size={13} className="text-sky-400" />;
  if (level === "step") return <PlayCircleIcon size={13} className="text-emerald-400" />;
  return <InfoCircleIcon size={13} className="text-muted-foreground" />;
}

function levelTextClass(level: JobLogLevel) {
  if (level === "error") return "text-red-300";
  if (level === "warn") return "text-amber-300";
  if (level === "system") return "text-sky-300";
  if (level === "step") return "text-emerald-200";
  return "text-zinc-200";
}

function runDurationMs(run: JobRun): number {
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  const fromLogs = normalizeLogs(run.logs).reduce((max, e) => Math.max(max, e.t + (e.duration ?? 0)), 0);
  return Math.max(1, end - start, fromLogs);
}

function timelineMarks(totalMs: number): number[] {
  if (totalMs <= 0) return [0];
  return [0, totalMs * 0.25, totalMs * 0.5, totalMs * 0.75, totalMs];
}

/** Shared time axis track — ticks, span bars, and event dots use the same 0→100% space. */
function TimelineTrack({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`relative h-full min-h-[28px] border-l border-white/5 px-2.5 ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-2.5 right-2.5">
        {[25, 50, 75].map((p) => (
          <span key={p} className="absolute inset-y-0 w-px bg-foreground/8" style={{ left: `${p}%` }} />
        ))}
      </div>
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

function TimelineTicks({ durationMs }: { durationMs: number }) {
  const marks = timelineMarks(durationMs);
  return (
    <TimelineTrack className="flex items-end pb-1">
      {marks.map((m, i) => (
        <span key={m} className="absolute bottom-1 -translate-x-1/2 text-[9px] tabular-nums text-zinc-500" style={{ left: `${(i / (marks.length - 1)) * 100}%` }}>
          {formatOffset(m)}
        </span>
      ))}
    </TimelineTrack>
  );
}

function levelBarClass(level: JobLogLevel) {
  if (level === "error") return "bg-red-500/80";
  if (level === "warn") return "bg-amber-400/80";
  if (level === "system") return "bg-sky-400/70";
  if (level === "step") return "bg-emerald-500/85";
  return "bg-zinc-500/70";
}

function TimelineSpanBar({ status }: { status: JobRun["status"] }) {
  const barClass = status === "failed" ? "bg-red-500" : status === "success" ? "bg-emerald-500" : "bg-brand animate-pulse";
  return (
    <TimelineTrack className="flex items-center">
      <div className={`h-1.75 w-full rounded-xs ${barClass}`} />
    </TimelineTrack>
  );
}

/** Segment from this log's timestamp until the next log (or run end). */
function TimelineEventSegment({
  t,
  endT,
  durationMs,
  level,
}: {
  t: number;
  endT: number;
  durationMs: number;
  level: JobLogLevel;
}) {
  const startPct = Math.min(100, Math.max(0, (t / durationMs) * 100));
  const endPct = Math.min(100, Math.max(startPct, (endT / durationMs) * 100));
  const widthPct = Math.max(endPct - startPct, 0.35);
  return (
    <TimelineTrack className="flex items-center">
      <div className={`absolute top-1/2 h-1.25 -translate-y-1/2 rounded-xs ${levelBarClass(level)}`} style={{ left: `${startPct}%`, width: `${widthPct}%` }} title={`${formatOffset(t)} → ${formatOffset(endT)} (${formatOffset(Math.max(0, endT - t))})`} />
    </TimelineTrack>
  );
}

/** Nest log/console entries under the innermost step whose [t, t+duration] contains them. */
function buildDisplayRows(entries: JobLogEntry[], totalDurationMs: number): Array<{ entry: JobLogEntry; depth: number; endT: number; segmentMs: number }> {
  const stepIdxs = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === "step" || e.level === "step");

  // Hide open "start"markers once the matching completed step exists (same name + start time).
  const skip = new Set<number>();
  for (const { e, i } of stepIdxs) {
    if (e.duration != null) continue;
    const hasEnd = stepIdxs.some(({ e: other, i: j }) => j !== i && other.message === e.message && other.duration != null && Math.abs(other.t - e.t) <= 25);
    if (hasEnd) skip.add(i);
  }

  const visibleSteps = stepIdxs.filter(({ i }) => !skip.has(i));

  const findParentStep = (log: JobLogEntry, logIdx: number): number | null => {
    let best: { i: number; dur: number } | null = null;
    for (const { e, i } of visibleSteps) {
      if (i === logIdx) continue;
      if (e.duration != null) {
        const dur = e.duration;
        if (log.t >= e.t && log.t <= e.t + dur) {
          if (!best || dur < best.dur) best = { i, dur };
        }
        continue;
      }
      // Open step (still running): owns logs after it until the next step starts.
      if (log.t < e.t) continue;
      const nextStep = visibleSteps.find(({ e: s, i: j }) => j !== i && s.t > e.t);
      if (nextStep && log.t >= nextStep.e.t) continue;
      const openDur = Number.POSITIVE_INFINITY;
      if (!best || openDur < best.dur) best = { i, dur: openDur };
    }
    return best?.i ?? null;
  };

  const childrenByStep = new Map<number, number[]>();
  const nested = new Set<number>();
  entries.forEach((e, i) => {
    if (skip.has(i)) {
      nested.add(i);
      return;
    }
    if (e.kind === "step" || e.level === "step") return;
    if (e.kind === "system" || e.level === "system") return;
    const parent = findParentStep(e, i);
    if (parent == null) return;
    nested.add(i);
    const list = childrenByStep.get(parent) ?? [];
    list.push(i);
    childrenByStep.set(parent, list);
  });

  const roots = entries
    .map((e, i) => ({ e, i }))
    .filter(({ i }) => !nested.has(i) && !skip.has(i))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i);

  const rows: Array<{ entry: JobLogEntry; depth: number; endT: number; segmentMs: number }> = [];

  for (let r = 0; r < roots.length; r++) {
    const { e, i } = roots[r];
    const nextRoot = roots[r + 1]?.e;
    const endT = e.duration != null ? e.t + e.duration : nextRoot ? Math.max(nextRoot.t, e.t) : totalDurationMs;
    const segmentMs = e.duration ?? Math.max(0, endT - e.t);
    rows.push({ entry: e, depth: 0, endT, segmentMs });

    const childIdxs = (childrenByStep.get(i) ?? []).sort((a, b) => entries[a].t - entries[b].t || a - b);
    const stepEnd = e.duration != null ? e.t + e.duration : endT;
    for (let c = 0; c < childIdxs.length; c++) {
      const child = entries[childIdxs[c]];
      const nextChild = c + 1 < childIdxs.length ? entries[childIdxs[c + 1]] : null;
      const childEnd = child.duration != null ? child.t + child.duration : nextChild ? Math.max(nextChild.t, child.t) : stepEnd;
      const childSeg = child.duration ?? Math.max(0, childEnd - child.t);
      rows.push({ entry: child, depth: 1, endT: childEnd, segmentMs: childSeg });
    }
  }

  return rows;
}

export function JobRunsPanel({
  runs,
  activeRunId,
  onCancelRun,
}: {
  runs: JobRun[];
  activeRunId: string | null;
  onCancelRun?: (runId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [showDurations, setShowDurations] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const selected = runs.find((r) => r.id === (selectedId ?? activeRunId ?? runs[0]?.id)) ?? null;
  const entries = useMemo(() => normalizeLogs(selected?.logs), [selected?.logs]);
  const durationMs = selected ? runDurationMs(selected) : 1;

  const runsByDay = useMemo(() => {
    const groups: Array<{ key: string; label: string; runs: JobRun[] }> = [];
    for (const run of runs) {
      const key = getDayKey(run.startedAt);
      const last = groups[groups.length - 1];
      if (last?.key === key) {
        last.runs.push(run);
      } else {
        groups.push({ key, label: formatDayHeader(run.startedAt), runs: [run] });
      }
    }
    return groups;
  }, [runs]);

  const displayRows = useMemo(() => {
    const rows = buildDisplayRows(entries, durationMs);
    const q = search.trim().toLowerCase();
    if (!errorsOnly && !q) return rows;

    const match = (e: JobLogEntry) => {
      if (errorsOnly && e.level !== "error" && e.level !== "warn") return false;
      if (q && !e.message.toLowerCase().includes(q)) return false;
      return true;
    };

    const keep = new Set<number>();
    rows.forEach((row, i) => {
      if (!match(row.entry)) return;
      keep.add(i);
      if (row.depth > 0) {
        for (let j = i - 1; j >= 0; j--) {
          if (rows[j].depth === 0) {
            keep.add(j);
            break;
          }
        }
      }
    });
    return rows.filter((_, i) => keep.has(i));
  }, [entries, durationMs, search, errorsOnly]);

  useEffect(() => {
    if (activeRunId) setSelectedId(activeRunId);
  }, [activeRunId]);

  useEffect(() => {
    if (!logRef.current || !selected) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [selected?.logs, selected?.id, displayRows.length]);

  const gridStyle = { gridTemplateColumns: `minmax(0,1fr) ${TIMELINE_W}px` };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-card">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-border-subtle">
        <RenderIf condition={runs.length === 0}>
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">No runs yet</div>
        </RenderIf>
        {runsByDay.map((group) => (
          <div key={group.key}>
            <div className="sticky top-0 z-1 bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{group.label}</div>
            {group.runs.map((run) => {
              const active = selected?.id === run.id;
              const duration = runListDuration(run);
              return (
                <button key={run.id} type="button" onClick={() => setSelectedId(run.id)} className={["relative flex w-full cursor-pointer items-center gap-2 border-0 px-3 py-1.5 text-left transition-colors", active ? "bg-accent text-foreground" : "bg-transparent text-foreground hover:bg-muted/40"].join(" ")}>
                  {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand-soft" /> : null}
                  <span className="shrink-0">{statusIcon(run.status, 14)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium tabular-nums leading-none">{formatTimeOnly(run.startedAt)}</span>
                  <span className="shrink-0 text-[11px] capitalize leading-none text-tertiary-foreground">{run.trigger}</span>
                  {duration ? <span className="w-10 shrink-0 text-right text-[11px] tabular-nums leading-none text-tertiary-foreground">{duration}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Select a run</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-1.5">
              <Input size="small" allowClear prefix={<MagnifierIcon size={12} className="text-muted-foreground" />} placeholder="Search log" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-50" />
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Switch size="small" checked={errorsOnly} onChange={setErrorsOnly} aria-label="Errors only" />
                Errors only
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Switch size="small" checked={showDurations} onChange={setShowDurations} aria-label="Show durations" />
                Show durations
              </div>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {selected.status === "running" && onCancelRun ? (
                  <Button size="small" danger icon={<StopCircleIcon size={12} weight="BoldDuotone" />} onClick={() => onCancelRun(selected.id)}>
                    Stop
                  </Button>
                ) : null}
                {statusIcon(selected.status)}
                <span className="font-medium text-foreground">{selected.status}</span>
                <span>·</span>
                <span>{selected.trigger}</span>
                <span>·</span>
                <span>{formatOffset(durationMs)}</span>
              </span>
            </div>

            <div className="sticky top-0 z-10 grid border-b border-white/5 bg-[#0d1117]" style={gridStyle}>
              <div className="flex h-8 items-center gap-2 px-3 text-[11px] text-zinc-400">
                {statusIcon(selected.status)}
                <span className="font-medium text-zinc-200">Attempt 1</span>
                {showDurations ? (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="tabular-nums">{formatOffset(durationMs)}</span>
                  </>
                ) : null}
                {selected.error ? <span className="truncate text-red-400">{selected.error}</span> : null}
              </div>
              <TimelineTicks durationMs={durationMs} />
            </div>

            <div ref={logRef} className="min-h-0 flex-1 overflow-auto bg-[#0d1117]">
              <div className="grid border-b border-white/3" style={gridStyle}>
                <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-400">
                  <span className="font-medium text-zinc-300">Run</span>
                  {showDurations ? <span className="tabular-nums text-zinc-500">{formatOffset(durationMs)}</span> : null}
                </div>
                <TimelineSpanBar status={selected.status} />
              </div>

              {displayRows.length === 0 ? (
                <div className="px-3 py-8 text-center text-[11px] text-zinc-500">{selected.status === "running" ? "Waiting for output…" : "(no logs)"}</div>
              ) : (
                displayRows.map((row, i) => (
                  <div key={`${row.entry.t}-${i}-${row.entry.message.slice(0, 24)}`} className="grid border-b border-white/3" style={gridStyle}>
                    <div className="flex items-start gap-2 py-1.5 pr-3 font-mono text-[11px] leading-snug" style={{ paddingLeft: `${12 + row.depth * 16}px` }}>
                      {row.depth > 0 ? <span className="mt-0.5 w-3 shrink-0 text-zinc-600">└</span> : null}
                      <span className="mt-0.5 shrink-0">{levelIcon(row.entry.level)}</span>
                      <span className={`min-w-0 flex-1 break-all whitespace-pre-wrap ${levelTextClass(row.entry.level)}`}>{row.entry.message}</span>
                      {showDurations ? <span className="shrink-0 tabular-nums text-[10px] text-zinc-500">{formatOffset(row.segmentMs)}</span> : null}
                    </div>
                    <TimelineEventSegment t={row.entry.t} endT={row.endT} durationMs={durationMs} level={row.entry.level} />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
