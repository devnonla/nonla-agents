import { LinkIcon } from "@solar-icons/react/dynamic/link";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Button, Input, Popover, message } from "antd";
import { useEffect, useState } from "react";

export type PublishNodeData = {
  isPublic: boolean;
  agentId: string;
  publicPassword: string;
  onSavePassword: (password: string) => Promise<void>;
};

export type PublishNodeType = Node<PublishNodeData, "publish">;

export function PublishNode({ data }: NodeProps<PublishNodeType>) {
  const [localPassword, setLocalPassword] = useState(data.publicPassword || "");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setLocalPassword(data.publicPassword || "");
  }, [data.publicPassword]);

  const dirty = localPassword !== (data.publicPassword || "");
  const publicLink = `${window.location.origin}/chat/${data.agentId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicLink);
    message.success("Link copied!");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await data.onSavePassword(localPassword);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nodrag nopan relative flex flex-col items-center gap-2">
      <Handle type="source" position={Position.Right} style={{ top: 28 }} className="w-2! h-2! bg-edge-call-agent/20! border-2! border-edge-call-agent/35! transition-all duration-150" />

      <Popover
        trigger="click"
        placement="top"
        arrow
        styles={{ root: { width: 420 }, container: { width: 420 } }}
        content={
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2 bg-muted px-2.5 py-1.5 rounded-lg border border-border">
              <LinkIcon size={13} className="text-primary shrink-0" />
              <a href={publicLink} target="_blank" rel="noreferrer" className="text-[12px] text-primary no-underline font-medium flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                {publicLink}
              </a>
              <Button size="small" onClick={handleCopyLink} className="shrink-0">
                Copy
              </Button>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Access Password</span>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} placeholder="Leave blank for open access" value={localPassword} onChange={(e) => setLocalPassword(e.target.value)} className="pr-9" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer">
                  {showPassword ? (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Guests must enter this password to access the chat.</p>
            </div>

            <div className="flex justify-end">
              <Button size="small" type="primary" disabled={!dirty} loading={saving} onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        <button type="button" className="relative flex flex-col items-center gap-2 bg-transparent border-none cursor-pointer group font-[inherit] p-0 outline-none">
          <div className={`w-14 h-14 rounded-full bg-card border-2 flex items-center justify-center transition-all duration-200 group-hover:scale-[1.08] group-active:scale-[0.95] ${data.isPublic ? "border-success/40" : "border-border group-hover:border-success/40"}`}>
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-all duration-200 ${data.isPublic ? "opacity-100 text-success" : "opacity-50 text-muted-foreground group-hover:opacity-80 group-hover:text-success"}`}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>

          <span className={`text-[11px] font-semibold leading-none tracking-wide transition-colors duration-200 ${data.isPublic ? "text-success" : "text-muted-foreground group-hover:text-success"}`}>Publish</span>
        </button>
      </Popover>
    </div>
  );
}
