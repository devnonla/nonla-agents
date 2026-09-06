import { ChatSpinner } from "@nonla-agents/ui";
import { BookmarkIcon } from "@solar-icons/react/dynamic/bookmark";
import { CpuIcon } from "@solar-icons/react/dynamic/cpu";
import { DangerCircleIcon } from "@solar-icons/react/dynamic/danger-circle";
import { LinkMinimalisticIcon } from "@solar-icons/react/dynamic/link-minimalistic";
import { NotesIcon } from "@solar-icons/react/dynamic/notes";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import type { ReactNode } from "react";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type MemoryAction = "upsert_node" | "update_node" | "forget_node" | "link" | "unlink" | "search" | "neighbors" | "list" | string;

type MemoryNode = { id?: string; content: string; label?: string; type?: string };
type MemoryEdge = { id?: string; from_id?: string; to_id?: string; relation?: string };
type MemoryLink = { relation?: string; direction?: string; node?: MemoryNode };

type MemoryInput = {
  action?: MemoryAction;
  id?: string;
  type?: string;
  label?: string;
  content?: string;
  from_id?: string;
  to_id?: string;
  relation?: string;
  query?: string;
};

type MemoryOutput = {
  ok?: boolean;
  error?: string;
  id?: string;
  message?: string;
  removed?: number;
  count?: number;
  node?: MemoryNode;
  nodes?: MemoryNode[];
  edges?: MemoryEdge[];
  links?: MemoryLink[];
  edge?: MemoryEdge;
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

function actionVerb(action: MemoryAction | undefined, running: boolean, failed: boolean): string {
  if (failed) return "Memory update failed";
  if (running) {
    switch (action) {
      case "upsert_node":
      case "update_node":
        return "Remembering…";
      case "forget_node":
        return "Forgetting…";
      case "link":
        return "Linking…";
      case "unlink":
        return "Unlinking…";
      case "search":
      case "neighbors":
      case "list":
        return "Recalling…";
      default:
        return "Updating memory…";
    }
  }
  switch (action) {
    case "upsert_node":
    case "update_node":
      return "Remembered";
    case "forget_node":
      return "Forgot";
    case "link":
      return "Linked";
    case "unlink":
      return "Unlinked";
    case "search":
    case "neighbors":
    case "list":
      return "Recalled";
    default:
      return "Memory";
  }
}

function actionIcon(action: MemoryAction | undefined, failed: boolean, running: boolean): ReactNode {
  if (failed) return <DangerCircleIcon size={13} className="text-destructive shrink-0" />;
  if (running) return <ChatSpinner />;
  switch (action) {
    case "upsert_node":
    case "update_node":
      return <BookmarkIcon size={13} className="text-muted-foreground shrink-0" />;
    case "forget_node":
    case "unlink":
      return <TrashBinMinimalisticIcon size={13} className="text-muted-foreground shrink-0" />;
    case "link":
      return <LinkMinimalisticIcon size={13} className="text-muted-foreground shrink-0" />;
    case "search":
    case "neighbors":
    case "list":
      return <CpuIcon size={13} className="text-muted-foreground shrink-0" />;
    default:
      return <NotesIcon size={13} className="text-muted-foreground shrink-0" />;
  }
}

function nodeText(node: MemoryNode): string {
  return (node.content || node.label || "").trim();
}

function NodeChip({ node }: { node: MemoryNode }) {
  const text = nodeText(node);
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border-subtle bg-muted/40 px-2 py-1 text-[11px] leading-[1.4] text-foreground/90">
      <span className="truncate">{text}</span>
    </span>
  );
}

export function UserMemoryToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const input = parseJson<MemoryInput>(msg.toolInput) ?? {};
  const output = parseJson<MemoryOutput>(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const callerColor = assistantColor ?? "var(--primary)";
  const action = input.action;

  const inputContent = (input.content || input.label || "").trim();
  const nodes = output?.nodes ?? (output?.node ? [output.node] : inputContent ? [{ content: inputContent }] : []);
  const links = output?.links ?? [];
  const edges = output?.edges ?? [];

  const summaryExtra = (() => {
    if (running || failed) return null;
    if ((action === "upsert_node" || action === "update_node") && (output?.node || inputContent)) {
      const text = output?.node ? nodeText(output.node) : inputContent;
      return text.length > 40 ? `${text.slice(0, 39)}…` : text || null;
    }
    if (action === "forget_node") return inputContent || input.id?.slice(0, 8) || null;
    if (action === "link") return input.relation ?? "related_to";
    if (action === "unlink") return `${output?.removed ?? 0} link(s)`;
    if (action === "list") {
      const parts: string[] = [];
      if (nodes.length) parts.push(`${nodes.length} node${nodes.length === 1 ? "" : "s"}`);
      if (edges.length) parts.push(`${edges.length} link${edges.length === 1 ? "" : "s"}`);
      return parts.join(" · ") || "empty";
    }
    if (action === "search") return `${output?.count ?? nodes.length} match(es)`;
    if (action === "neighbors") return `${links.length} link(s)`;
    return null;
  })();

  const showBody = !running && !failed && (((action === "upsert_node" || action === "update_node" || action === "search" || action === "list") && nodes.length > 0) || (action === "neighbors" && (nodes.length > 0 || links.length > 0)) || (action === "list" && hasOutput) || (action === "link" && !!output?.edge));

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
        <div>
          <div className="flex items-center gap-2 py-1">
            {actionIcon(action, failed, running)}
            <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
              {actionVerb(action, running, failed)}
              <RenderIf condition={!!summaryExtra}>{() => <span className="text-tertiary-foreground"> · {summaryExtra}</span>}</RenderIf>
            </span>
          </div>

          <RenderIf condition={failed && !!(output?.error || msg.toolError)}>
            {() => (
              <div className="mt-0.5 overflow-hidden rounded-lg border border-border-subtle px-3 py-2">
                <p className="m-0 text-[11px] leading-[1.45] text-destructive">{output?.error ?? "Tool execution failed"}</p>
              </div>
            )}
          </RenderIf>

          <RenderIf condition={showBody}>
            <div className="mt-0.5 flex flex-col gap-2 overflow-hidden rounded-lg border border-border-subtle px-3 py-2">
              <RenderIf condition={nodes.length > 0}>
                <div className="flex flex-wrap gap-1.5">
                  {nodes.map((node, i) => (
                    <NodeChip key={node.id ?? `${nodeText(node)}-${i}`} node={node} />
                  ))}
                </div>
              </RenderIf>

              <RenderIf condition={links.length > 0}>
                <div className="flex flex-col gap-1">
                  {links.map((link) => (
                    <span key={`${link.direction}-${link.relation}-${link.node?.id ?? ""}`} className="text-[11px] text-muted-foreground">
                      {link.direction === "in" ? "←" : "→"} {link.relation} {link.node ? nodeText(link.node) : ""}
                    </span>
                  ))}
                </div>
              </RenderIf>

              <RenderIf condition={action === "list" && nodes.length === 0 && edges.length === 0}>
                <span className="text-[11px] text-muted-foreground">No memories yet</span>
              </RenderIf>
            </div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}

/** @deprecated */
export const ManageMemoryToolUI = UserMemoryToolUI;
