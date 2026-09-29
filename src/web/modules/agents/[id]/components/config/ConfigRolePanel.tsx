// ─── Config: Role Panel ───────────────────────────────────────────────────────
// Identity (avatar / name / description) and model.

import { Input, Popover } from "devnonla-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarEditorPanel } from "src/components/AvatarEditorPanel";
import { ModelPicker } from "src/components/ModelPicker";
import { UserAvatar } from "src/components/UserAvatar";
import { useAgentDetailContext } from "../../common/agentDetailContext";

export function ConfigRolePanel() {
  const { name, description, avatar, selectedProviderId, aiModel, onNameChange, onDescriptionChange, onAvatarChange, onModelChange } = useAgentDetailContext();

  const [localName, setLocalName] = useState(name);
  const [localDesc, setLocalDesc] = useState(description);
  const [localAvatar, setLocalAvatar] = useState(avatar);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocalName(name), [name]);
  useEffect(() => setLocalDesc(description), [description]);
  useEffect(() => setLocalAvatar(avatar), [avatar]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalName(v);
      if (nameDebounce.current) clearTimeout(nameDebounce.current);
      nameDebounce.current = setTimeout(() => onNameChange(v), 600);
    },
    [onNameChange],
  );

  const handleDescChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalDesc(v);
      if (descDebounce.current) clearTimeout(descDebounce.current);
      descDebounce.current = setTimeout(() => onDescriptionChange(v), 600);
    },
    [onDescriptionChange],
  );

  const pendingAvatarRef = useRef<string | null>(null);

  const flushAvatarSave = useCallback(async () => {
    if (avatarDebounce.current) {
      clearTimeout(avatarDebounce.current);
      avatarDebounce.current = null;
    }
    const next = pendingAvatarRef.current;
    if (next == null) return;
    pendingAvatarRef.current = null;
    setAvatarSaving(true);
    try {
      await onAvatarChange(next);
    } finally {
      setAvatarSaving(false);
    }
  }, [onAvatarChange]);

  const handleAvatarDraftChange = useCallback(
    (next: string) => {
      setLocalAvatar(next);
      pendingAvatarRef.current = next;
      if (avatarDebounce.current) clearTimeout(avatarDebounce.current);
      avatarDebounce.current = setTimeout(() => {
        void flushAvatarSave();
      }, 400);
    },
    [flushAvatarSave],
  );

  useEffect(
    () => () => {
      if (nameDebounce.current) clearTimeout(nameDebounce.current);
      if (descDebounce.current) clearTimeout(descDebounce.current);
      if (avatarDebounce.current) clearTimeout(avatarDebounce.current);
    },
    [],
  );

  return (
    <section className="max-w-lg rounded-2xl border border-white/50 bg-white/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      <div className="flex flex-col gap-4">
        <Popover
          open={avatarOpen}
          onOpenChange={(open) => {
            setAvatarOpen(open);
            if (!open) void flushAvatarSave();
          }}
          trigger="click"
          placement="bottom"
          content={
            <div className="w-80 p-4">
              <AvatarEditorPanel avatar={localAvatar} name={localName || name} saving={avatarSaving} onChange={handleAvatarDraftChange} />
            </div>
          }
        >
          <button type="button" className="w-fit cursor-pointer rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" title="Edit avatar">
            <UserAvatar avatar={localAvatar} name={localName || name} size={80} className="border-2 border-white/60" />
          </button>
        </Popover>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
          <Input value={localName} onChange={handleNameChange} placeholder="Agent name" spellCheck={false} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model</span>
          <ModelPicker selectedProviderId={selectedProviderId} selectedModel={aiModel} onChange={onModelChange} placeholder="Select model…" />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
          <Input.TextArea value={localDesc} onChange={handleDescChange} placeholder="What does this agent do?" spellCheck={false} autoSize={{ minRows: 2, maxRows: 4 }} />
        </div>
      </div>
    </section>
  );
}
