import { Modal } from "devnonla-ui";
import { Plug } from "lucide-react";
import type { McpServer } from "src/common/types";
import { McpServerForm } from "src/modules/mcp-servers/components/McpServerForm";

export function McpConnectDialog({
  open,
  edit,
  onClose,
  onSaved,
}: {
  open: boolean;
  edit?: McpServer | null;
  onClose: () => void;
  onSaved: (server: McpServer) => void;
}) {
  const isEdit = !!edit;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">
              <Plug size={16} />
            </div>
          </div>
          <span className="truncate font-semibold text-foreground">{isEdit ? "Edit MCP server" : "Connect MCP server"}</span>
        </div>
      }
      width={520}
      centered
      destroyOnHidden
      footer={null}
    >
      <div className="pt-2">
        <McpServerForm key={edit?.id ?? "create"} edit={edit} onCancel={onClose} onSaved={onSaved} />
      </div>
    </Modal>
  );
}
