import { ChatSpinner } from "@nonla-agents/ui";
import { BookBookmarkIcon } from "@solar-icons/react/dynamic/book-bookmark";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type ReadSkillInput = { name?: string; reference?: string };
type SkillRef = { name?: string; title?: string };
type ReadSkillOutput = {
  ok?: boolean;
  error?: string;
  skill?: string;
  reference?: string;
  title?: string;
  references?: SkillRef[];
  available_references?: SkillRef[];
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

function refNames(list?: SkillRef[]): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((r) => (typeof r.name === "string" ? r.name.trim() : "")).filter(Boolean);
}

export function ReadSkillToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const input = parseJson<ReadSkillInput>(msg.toolInput) ?? {};
  const output = parseJson<ReadSkillOutput>(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const callerColor = assistantColor ?? "var(--primary)";

  const skillName = (output?.skill || input.name || "").trim();
  const reference = (output?.reference || input.reference || "").trim();
  const available = refNames(output?.references ?? output?.available_references);

  const verb = (() => {
    if (failed) return "Failed to read skill";
    if (running) return reference ? "Reading ref" : "Reading skill";
    return reference ? "Read skill ref" : "Read skill";
  })();

  const targetLabel = (() => {
    if (!skillName && !reference) return null;
    if (reference) return skillName ? `${skillName} / ${reference}` : reference;
    return skillName || null;
  })();

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
        <div className="flex items-center gap-2 py-1">
          {failed ? <DangerCircleIcon size={13} className="shrink-0 text-destructive" /> : running ? <ChatSpinner /> : reference ? <DocumentTextIcon size={13} className="shrink-0 text-muted-foreground" /> : <BookBookmarkIcon size={13} className="shrink-0 text-muted-foreground" />}
          <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
            {verb}
            <RenderIf condition={!!targetLabel}>{() => <span className="font-mono text-tertiary-foreground"> · {targetLabel}</span>}</RenderIf>
          </span>
        </div>

        <RenderIf condition={!running && !reference && available.length > 0}>
          {() => (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-medium tracking-wide text-quaternary-foreground uppercase">Refs</span>
              {available.map((name) => (
                <span key={name} className="inline-flex max-w-full items-center rounded-md border border-border-subtle bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] leading-[1.4] text-tertiary-foreground">
                  {skillName ? `${skillName} / ${name}` : name}
                </span>
              ))}
            </div>
          )}
        </RenderIf>
      </div>
    </div>
  );
}
