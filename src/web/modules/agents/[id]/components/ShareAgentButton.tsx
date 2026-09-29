// ─── Share Agent Button ───────────────────────────────────────────────────────
// Window-header share control: publish toggle, public link, access password.

import { Button, FluentIcon, Input, Popover, Switch, message } from "devnonla-ui";
import { useEffect, useState } from "react";
import { cn } from "src/common/lib/cn";
import { useAgentDetailContext } from "../common/agentDetailContext";

export function ShareAgentButton() {
  const { id, isPublic, onTogglePublish, publicPassword, onSavePassword } = useAgentDetailContext();
  const [open, setOpen] = useState(false);
  const [localPassword, setLocalPassword] = useState(publicPassword || "");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setLocalPassword(publicPassword || "");
  }, [publicPassword]);

  const dirty = localPassword !== (publicPassword || "");
  const publicLink = `${window.location.origin}/chat/${id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicLink);
    message.success("Link copied!");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSavePassword(localPassword);
      message.success("Password saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow
      styles={{ root: { width: 380 }, container: { width: 380 } }}
      content={
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <FluentIcon name="globe-24" size={16} className={cn("shrink-0", isPublic ? "text-success" : "text-muted-foreground opacity-50")} />
            <div className="min-w-0 flex-1">
              <div className={cn("text-[12px] font-medium leading-[1.4]", isPublic ? "text-success" : "text-foreground")}>{isPublic ? "Public" : "Private"}</div>
              <div className="mt-0.5 text-[11px] leading-[1.3] text-muted-foreground">{isPublic ? "Anyone with the link can chat" : "Only you can access this agent"}</div>
            </div>
            <Switch size="small" checked={isPublic} onChange={onTogglePublish} />
          </div>

          {isPublic && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5">
                <FluentIcon name="link-24" size={13} className="shrink-0 text-primary" />
                <a href={publicLink} target="_blank" rel="noreferrer" className="flex-1 overflow-hidden text-[12px] font-medium whitespace-nowrap text-ellipsis text-primary no-underline">
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
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded border-none bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground">
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
                <p className="m-0 text-[10px] text-muted-foreground">Guests must enter this password to access the chat.</p>
              </div>

              <div className="flex justify-end">
                <Button size="small" type="primary" disabled={!dirty} loading={saving} onClick={() => void handleSave()}>
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      }
    >
      <button type="button" aria-label="Share agent" title="Share" className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 transition-colors", isPublic ? "bg-success/12 text-success hover:bg-success/18" : "bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground")}>
        <FluentIcon name="globe-24" size={14} />
      </button>
    </Popover>
  );
}
