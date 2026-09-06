import { ChatSpinner } from "@nonla-agents/ui";
import { CodeSquareIcon } from "@solar-icons/react/dynamic/code-square";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type SchemaInput = { names?: string[] };
type SchemaOutput = { tools?: Array<{ name: string }>; missing?: string[] };

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

export function GetToolSchemaToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const input = parseJson<SchemaInput>(msg.toolInput) ?? {};
  const output = parseJson<SchemaOutput>(msg.toolOutput);
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const callerColor = assistantColor ?? "var(--primary)";

  const requested = (input.names ?? []).filter((n) => typeof n === "string" && n.trim());
  const loaded = (output?.tools ?? []).map((t) => t.name).filter(Boolean);
  const missing = output?.missing ?? [];
  const names = loaded.length > 0 ? loaded : requested;

  const namesLabel = (() => {
    if (hasError || (names.length === 0 && missing.length === 0 && !running)) return null;
    if (running) return requested.length > 0 ? requested.join(", ") : null;
    if (names.length === 0 && missing.length > 0) return missing.join(", ");
    if (missing.length > 0) return `${names.join(", ")} · missing ${missing.join(", ")}`;
    return names.join(", ") || null;
  })();

  const verb = (() => {
    if (hasError) return "Failed to load schemas";
    if (running) return "Loading schemas";
    if (names.length === 0 && missing.length > 0) return "No schemas found";
    return "Loaded schemas";
  })();

  return (
    <div className="animate-fadeIn mt-1">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none" style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}>
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <div className="flex items-center gap-2 py-1">
          {hasError ? <DangerCircleIcon size={13} className="text-destructive shrink-0" /> : running ? <ChatSpinner /> : <CodeSquareIcon size={13} className="text-muted-foreground shrink-0" />}
          <span className="text-[12px] font-medium text-muted-foreground truncate min-w-0">
            {verb}
            <RenderIf condition={!!namesLabel}>{() => <span className="text-tertiary-foreground font-mono"> · {namesLabel}</span>}</RenderIf>
          </span>
        </div>
      </div>
    </div>
  );
}
