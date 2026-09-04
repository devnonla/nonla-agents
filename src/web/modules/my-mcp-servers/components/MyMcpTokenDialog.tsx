import { Alert, Button, Input, Modal, message } from "@nonla-agents/ui";
import { ClipboardIcon } from "@solar-icons/react/dynamic/clipboard";
import type { MyMcpServer } from "src/common/types";
import { claudeCodeMcpSnippet, cursorMcpSnippet, mcpEndpointUrl } from "../common/snippets";

export function MyMcpTokenDialog({ server, onClose }: { server: MyMcpServer; onClose: () => void }) {
  const secret = server.key?.trim() ?? "";
  const url = mcpEndpointUrl(server.id);
  const cursor = cursorMcpSnippet(server.name, url, secret || "ra_mcp_…");
  const claude = claudeCodeMcpSnippet(server.name, url, secret || "ra_mcp_…");

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label} copied`);
    } catch {
      message.error("Copy failed");
    }
  };

  return (
    <Modal
      open
      title="Copy this token now"
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          Done
        </Button>
      }
      destroyOnHidden
      width={640}
    >
      <div className="flex flex-col gap-4 pt-1">
        <Alert type="warning" showIcon title="You will not be able to see this token again. Anyone with it can run the tools on this server." />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Token</span>
          <div className="flex items-center gap-2">
            <Input value={secret} readOnly className="font-mono text-[12px]" />
            <Button type="text" icon={<ClipboardIcon size={14} />} onClick={() => void copy(secret, "Token")} aria-label="Copy token" />
          </div>
        </div>
        <SnippetBlock title="Cursor — mcp.json" value={cursor} onCopy={() => void copy(cursor, "Cursor snippet")} />
        <SnippetBlock title='Claude Code — add "type": "http"' value={claude} onCopy={() => void copy(claude, "Claude Code snippet")} />
      </div>
    </Modal>
  );
}

function SnippetBlock({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{title}</span>
        <Button type="text" size="small" icon={<ClipboardIcon size={13} />} onClick={onCopy}>
          Copy
        </Button>
      </div>
      <pre className="m-0 max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">{value}</pre>
    </div>
  );
}
