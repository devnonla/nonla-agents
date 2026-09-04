import { Alert, Button, Input, Modal, message } from "@nonla-agents/ui";
import { ClipboardIcon } from "@solar-icons/react/dynamic/clipboard";
import { useMemo } from "react";
import type { AgentListItem, ApiKey, DatatableProject, KvStoreEntry } from "src/common/types";
import { MarkdownPreview } from "src/components/MarkdownPreview";
import { buildV1AgentBrief, toBriefScope } from "./v1AgentBrief";

interface CreatedKeyDialogProps {
  created: ApiKey;
  agents: AgentListItem[];
  datatableProjects: DatatableProject[];
  kvEntries: KvStoreEntry[];
  onClose: () => void;
}

export function CreatedKeyDialog({ created, agents, datatableProjects, kvEntries, onClose }: CreatedKeyDialogProps) {
  const secret = created.key?.trim() ?? "";
  const justCreated = Boolean(secret);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const llmDocs = useMemo(
    () =>
      buildV1AgentBrief({
        origin,
        scope: toBriefScope(created, agents, datatableProjects, kvEntries),
      }),
    [origin, created, agents, datatableProjects, kvEntries],
  );

  const copyDocs = async () => {
    try {
      await navigator.clipboard.writeText(llmDocs);
      message.success("Copied");
    } catch {
      message.error("Copy failed");
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      message.success("Key copied");
    } catch {
      message.error("Copy failed");
    }
  };

  return (
    <Modal
      open
      title={justCreated ? "API key created" : `${created.name} — LLM Docs`}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {justCreated ? "Done" : "Close"}
        </Button>
      }
      destroyOnHidden
      width={640}
    >
      <div className="flex flex-col gap-4 pt-1">
        {justCreated ? (
          <>
            <Alert type="warning" showIcon title="Copy this key now. You will not be able to see it again." />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Secret key</span>
              <div className="flex items-center gap-2">
                <Input value={secret} readOnly className="font-mono text-[12px]" />
                <Button type="text" icon={<ClipboardIcon size={14} />} onClick={() => void copyKey()} aria-label="Copy key" />
              </div>
            </div>
          </>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">LLM Docs</span>
            <Button type="text" size="small" icon={<ClipboardIcon size={13} />} onClick={() => void copyDocs()}>
              Copy
            </Button>
          </div>
          <div className="max-h-112 overflow-auto px-4 py-4">
            <MarkdownPreview content={llmDocs} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
