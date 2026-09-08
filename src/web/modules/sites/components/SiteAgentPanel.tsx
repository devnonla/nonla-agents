import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";

import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { AgentPanel } from "src/components/chat/_components/AgentPanel";
import { liveSiteToolLabel, siteTurnSummaryHint, summarizeSiteToolCall } from "../common/compactSiteHistory";

export type { ToolActionEvent };

export type SiteSelectionContext = {
  label: string;
  detail: string;
};

interface SiteAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  selectionContext?: SiteSelectionContext | null;
  onClearSelection?: () => void;
  onResizeDraggingChange?: (dragging: boolean) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function SiteAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange, selectionContext = null, onClearSelection, onResizeDraggingChange, onGeneratingChange, onBeforeSend }: SiteAgentPanelProps) {
  return (
    <AgentPanel
      title="Nonla Site Developer"
      emptyState="Describe a layout, copy, or wiring change. Drafts stay unpublished until you approve."
      providerId={providerId}
      model={model}
      streamUrl={streamUrl}
      onModelChange={onModelChange}
      onToolAction={onToolAction}
      summarizeToolCall={summarizeSiteToolCall}
      turnSummaryHint={siteTurnSummaryHint}
      labelToolCall={liveSiteToolLabel}
      onGeneratingChange={onGeneratingChange}
      onBeforeSend={onBeforeSend}
      extraContext={selectionContext?.detail}
      onAfterSend={onClearSelection}
      resize={{ defaultWidth: 360, minWidth: 320, maxWidth: 560, onDraggingChange: onResizeDraggingChange, mobileStack: true }}
      accessory={
        selectionContext ? (
          <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-accent/30">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Selected</span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={selectionContext.label}>
              {selectionContext.label}
            </span>
            <button type="button" onClick={onClearSelection} className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Clear selection">
              <CloseCircleIcon size={14} />
            </button>
          </div>
        ) : undefined
      }
    />
  );
}
