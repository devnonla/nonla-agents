import { ChatSpinner } from "@nonla-agents/ui";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { PlayCircleIcon } from "@solar-icons/react/dynamic/play-circle";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { prettyJson } from "../../common/utils";
import type { ToolUIProps } from "./types";

type ScriptInput = { testInput?: unknown };
type ScriptOutput = {
  success?: boolean;
  output?: unknown;
  error?: string;
  console?: string;
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as T;
  } catch {
    /* ignore */
  }
  return null;
}

function extractParams(input: unknown): unknown {
  const parsed = parseJson<ScriptInput>(input);
  if (!parsed) return {};
  return "testInput" in parsed ? (parsed.testInput ?? {}) : parsed;
}

function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return <pre className={cn("m-0 max-h-40 overflow-y-auto px-3 py-2 font-mono text-[11px] font-normal leading-[1.65] break-all whitespace-pre-wrap text-muted-foreground", className)}>{prettyJson(value)}</pre>;
}

export function RunCurrentScriptToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const input = extractParams(msg.toolInput);
  const output = parseJson<ScriptOutput>(msg.toolOutput);
  const running = !hasOutput && !hasError;
  const failed = hasError || output?.success === false;
  const callerColor = assistantColor ?? "var(--primary)";
  const consoleOut = output?.console?.trim() || null;

  const verb = failed ? "Script failed" : running ? "Running script" : "Ran script";
  const resultBody = failed ? (output?.error ?? "Tool execution failed") : output && "output" in output ? (output.output ?? "(empty)") : (msg.toolOutput ?? "(empty)");

  return (
    <div className="mt-1 animate-fadeIn">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <div className={cn("mb-1 overflow-hidden rounded-lg border", failed ? "border-destructive/35" : "border-border-subtle")}>
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            {failed ? <DangerCircleIcon size={13} className="shrink-0 text-destructive" /> : running ? <ChatSpinner /> : <PlayCircleIcon size={13} className="shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-muted-foreground">{verb}</span>
            <RenderIf condition={running}>
              <span className="text-[11px] italic text-muted-foreground">Running…</span>
            </RenderIf>
            <RenderIf condition={!running && !failed}>
              <span className="inline-flex h-5 items-center rounded-sm bg-success/10 px-1.5 text-[11px] font-medium text-success">OK</span>
            </RenderIf>
          </div>

          <div className="border-t border-border-subtle">
            <span className="block px-3 pt-2 text-[10px] font-medium tracking-wide text-quaternary-foreground">Parameters</span>
            <JsonBlock value={input} />
          </div>

          <div className={cn("border-t border-border-subtle", failed && "bg-destructive/6")}>
            <span className="block px-3 pt-2 text-[10px] font-medium tracking-wide text-quaternary-foreground">Result</span>
            <RenderIf condition={running}>
              <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                <ChatSpinner />
                <span className="italic">Running…</span>
              </div>
            </RenderIf>
            <RenderIf condition={!running}>
              <JsonBlock value={resultBody} className={failed ? "text-destructive" : undefined} />
            </RenderIf>
          </div>

          <RenderIf condition={!!consoleOut}>
            {() => (
              <div className="border-t border-border-subtle">
                <span className="block px-3 pt-2 text-[10px] font-medium tracking-wide text-quaternary-foreground">Console</span>
                <pre className="m-0 max-h-40 overflow-y-auto px-3 py-2 font-mono text-[11px] font-normal leading-[1.65] break-all whitespace-pre-wrap text-tertiary-foreground">{consoleOut}</pre>
              </div>
            )}
          </RenderIf>
        </div>
      </div>
    </div>
  );
}
