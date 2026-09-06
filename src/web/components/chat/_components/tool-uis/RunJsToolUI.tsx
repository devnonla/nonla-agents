import { ChatSpinner, CodeBlock } from "@nonla-agents/ui";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { prettyJson } from "../../common/utils";
import { parseBgTaskRef } from "../../hooks/useConversationBgTasks";
import { BackgroundTaskToolUI } from "./BackgroundTaskToolUI";
import type { ToolUIProps } from "./types";

type JsInput = { code?: string };
type JsOutput = {
  ok?: boolean;
  result?: unknown;
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

function extractCode(input: unknown): string {
  const parsed = parseJson<JsInput>(input);
  if (parsed?.code && typeof parsed.code === "string") return parsed.code;
  if (typeof input === "string") return input;
  return "";
}

export function RunJsToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  if (parseBgTaskRef(msg.toolOutput)) {
    return <BackgroundTaskToolUI msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={showAvatar} />;
  }

  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const code = extractCode(msg.toolInput);
  const output = parseJson<JsOutput>(msg.toolOutput);
  const running = !hasOutput && !hasError;
  const failed = hasError || output?.ok === false;
  const callerColor = assistantColor ?? "var(--primary)";
  const consoleOut = output?.console?.trim() || null;
  const lineCount = code ? code.split("\n").length : 0;
  const resultBody = failed ? (output?.error ?? msg.toolError ?? "Execution failed") : output && "result" in output ? (output.result ?? "(empty)") : (msg.toolOutput ?? "(empty)");
  const resultIsJson = !failed && resultBody !== null && typeof resultBody === "object";

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
        <CodeBlock
          code={code}
          language="javascript"
          title={failed ? "Failed" : running ? "Running" : undefined}
          lineNumbers={lineCount > 1}
          wordWrap
          className={cn("mb-1 shadow-none [&_.nonla-codeblock-pre]:max-h-56 [&_.nonla-codeblock-pre]:text-[12px] [&_.nonla-codeblock-pre]:leading-[1.7] [&_.nonla-codeblock-pre_code]:px-3 [&_.nonla-codeblock-pre_code]:py-2.5", failed && "border-destructive/35", !code && "[&_.nonla-codeblock-body]:hidden")}
        >
          <div className={cn("border-t border-border", failed && "bg-destructive/6")}>
            <div className="flex gap-2.5 px-3 py-2">
              <span className="mt-px w-4 shrink-0 select-none text-center font-mono text-[11px] leading-[1.7] text-quaternary-foreground" aria-hidden>
                ←
              </span>
              <RenderIf condition={running}>
                <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <ChatSpinner />
                  <span className="italic">Running…</span>
                </div>
              </RenderIf>
              <RenderIf condition={!running && resultIsJson}>
                {() => <CodeBlock code={prettyJson(resultBody)} language="json" wordWrap className="min-w-0 flex-1 mb-0 border-0 shadow-none rounded-none bg-transparent [&_.nonla-codeblock-pre]:max-h-40 [&_.nonla-codeblock-pre]:text-[12px] [&_.nonla-codeblock-pre_code]:px-0 [&_.nonla-codeblock-pre_code]:py-0" />}
              </RenderIf>
              <RenderIf condition={!running && !resultIsJson}>
                <pre className={cn("m-0 min-w-0 flex-1 max-h-40 overflow-y-auto font-mono text-[12px] font-normal leading-[1.7] break-all whitespace-pre-wrap", failed ? "text-destructive" : "text-foreground/90")}>{typeof resultBody === "string" ? resultBody : prettyJson(resultBody)}</pre>
              </RenderIf>
            </div>
          </div>

          <RenderIf condition={!!consoleOut}>
            {() => (
              <div className="border-t border-border">
                <div className="flex gap-2.5 px-3 py-2">
                  <span className="mt-px w-4 shrink-0 select-none text-center font-mono text-[11px] leading-[1.7] text-quaternary-foreground">·</span>
                  <pre className="m-0 min-w-0 flex-1 max-h-32 overflow-y-auto font-mono text-[11px] font-normal leading-[1.7] break-all whitespace-pre-wrap text-tertiary-foreground">{consoleOut}</pre>
                </div>
              </div>
            )}
          </RenderIf>
        </CodeBlock>
      </div>
    </div>
  );
}
