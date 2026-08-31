// ─── Agent Config Node ────────────────────────────────────────────────────────
// Central interactive node — replaces both config and current agent nodes.
// Contains: avatar, name, description, model picker, instruct button.
// Receives edges from tools (right-top) and callable agents (right-bottom).

import { AltArrowRightIcon } from "@solar-icons/react/dynamic/alt-arrow-right";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Popover, Switch } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { AvatarEditorPanel } from "src/components/AvatarEditorPanel";
import { ModelPicker } from "src/components/ModelPicker";
import { UserAvatar } from "src/components/UserAvatar";

export type AgentConfigNodeData = {
  name: string;
  description: string;
  avatar: string | null;
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onAvatarChange: (avatar: string) => void | Promise<void>;
  onModelChange: (providerId: string, model: string) => void;
  onOpenPrompt: () => void;
  isPublic: boolean;
  onTogglePublish: (checked: boolean) => void;
};

export type AgentConfigNodeType = Node<AgentConfigNodeData, "agentConfig">;

export function AgentConfigNode({ data }: NodeProps<AgentConfigNodeType>) {
  // Local state with debounced save for name & description
  const [localName, setLocalName] = useState(data.name);
  const [localDesc, setLocalDesc] = useState(data.description);
  const [localAvatar, setLocalAvatar] = useState(data.avatar);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent
  useEffect(() => {
    setLocalName(data.name);
  }, [data.name]);

  useEffect(() => {
    setLocalDesc(data.description);
  }, [data.description]);

  useEffect(() => {
    setLocalAvatar(data.avatar);
  }, [data.avatar]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalName(v);
      if (nameDebounce.current) clearTimeout(nameDebounce.current);
      nameDebounce.current = setTimeout(() => data.onNameChange(v), 600);
    },
    [data.onNameChange],
  );

  const handleDescChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalDesc(v);
      if (descDebounce.current) clearTimeout(descDebounce.current);
      descDebounce.current = setTimeout(() => data.onDescriptionChange(v), 600);
    },
    [data.onDescriptionChange],
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
      await data.onAvatarChange(next);
    } finally {
      setAvatarSaving(false);
    }
  }, [data.onAvatarChange]);

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

  useEffect(() => {
    return () => {
      if (avatarDebounce.current) clearTimeout(avatarDebounce.current);
    };
  }, []);

  const hasPrompt = Boolean(data.systemPrompt?.trim());
  const promptPreview = hasPrompt ? data.systemPrompt.replace(/\s+/g, " ").trim() : "";

  return (
    <div className="relative w-full">
      <Handle type="target" id="tools" position={Position.Right} style={{ top: 40 }} className="w-2! h-2! bg-edge-tool/30! border-2! border-edge-tool/50! transition-all duration-150 hover:bg-edge-tool! hover:border-edge-tool! hover:w-3! hover:h-3!" />
      <div style={{ position: "absolute", top: 40, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1 z-10">
        <span className="text-2xs font-semibold uppercase tracking-wider text-edge-tool bg-edge-tool/5 px-1.5 py-0.5 rounded-full">Tools</span>
      </div>

      <Handle type="target" id="skills" position={Position.Right} style={{ top: 76 }} className="w-2! h-2! bg-edge-skill/30! border-2! border-edge-skill/50! transition-all duration-150 hover:bg-edge-skill! hover:border-edge-skill! hover:w-3! hover:h-3!" />
      <div style={{ position: "absolute", top: 76, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1 z-10">
        <span className="text-2xs font-semibold uppercase tracking-wider text-edge-skill bg-edge-skill/5 px-1.5 py-0.5 rounded-full">Skills</span>
      </div>

      <Handle type="target" id="agents" position={Position.Right} style={{ top: 112 }} className="w-2! h-2! bg-edge-call-agent/30! border-2! border-edge-call-agent/50! transition-all duration-150 hover:bg-edge-call-agent! hover:border-edge-call-agent! hover:w-3! hover:h-3!" />
      <div style={{ position: "absolute", top: 112, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1 z-10">
        <span className="text-2xs font-semibold uppercase tracking-wider text-edge-call-agent bg-edge-call-agent/5 px-1.5 py-0.5 rounded-full">Agents</span>
      </div>

      {data.isPublic && <Handle type="target" id="publish" position={Position.Left} style={{ top: "auto", bottom: 36 }} className="w-2! h-2! bg-edge-call-agent/30! border-2! border-edge-call-agent/50! transition-all duration-150" />}

      <div className="w-full flex flex-col rounded-md border border-border bg-card transition-all duration-200">
        <div className="flex flex-col items-center pt-5 pb-2">
          <div className="nodrag nopan">
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
                  <AvatarEditorPanel avatar={localAvatar} name={localName || data.name} saving={avatarSaving} onChange={handleAvatarDraftChange} />
                </div>
              }
            >
              <button type="button" className="rounded-full ring-2 ring-transparent hover:ring-primary/30 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-primary/40" title="Edit avatar">
                <UserAvatar avatar={localAvatar} name={localName || data.name} size={80} />
              </button>
            </Popover>
          </div>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Name</span>
            <div className="nodrag nopan">
              <input
                type="text"
                value={localName}
                onChange={handleNameChange}
                placeholder="Agent name"
                spellCheck={false}
                className="w-full h-8 px-2.5 rounded-md text-xs font-medium text-foreground bg-muted border border-border outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/30 hover:border-border"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
            <div className="nodrag nopan nowheel">
              <textarea
                value={localDesc}
                onChange={handleDescChange}
                placeholder="What does this agent do?"
                spellCheck={false}
                rows={3}
                className="w-full px-2.5 py-2 rounded-md text-xs text-muted-foreground bg-muted border border-border resize-none outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/30 hover:border-border leading-normal"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model</span>
            <div className="nodrag nopan nowheel">
              <ModelPicker selectedProviderId={data.selectedProviderId} selectedModel={data.aiModel} onChange={data.onModelChange} placeholder="Select model…" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instruct</span>
              {hasPrompt && <span className="text-[10px] font-medium text-brand-soft">Configured</span>}
            </div>
            <div className="nodrag nopan">
              <button
                type="button"
                onClick={data.onOpenPrompt}
                className={`w-full max-w-full text-left rounded-md border transition-all duration-150 cursor-pointer group ${hasPrompt ? "bg-muted border-border hover:border-brand/35 hover:bg-brand/5" : "bg-brand/8 border-dashed border-brand/40 hover:border-brand/60 hover:bg-brand/12"}`}
              >
                {hasPrompt ? (
                  <div className="flex items-start gap-2.5 px-2.5 py-2.5">
                    <div className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-brand/20 transition-colors">
                      <DocumentTextIcon size={14} className="text-brand-soft" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-foreground leading-[1.3] mb-0.5">Instructions</div>
                      <div className="text-[11px] text-tertiary-foreground leading-[1.45] line-clamp-2">{promptPreview}</div>
                    </div>
                    <AltArrowRightIcon size={14} className="text-muted-foreground shrink-0 mt-1 group-hover:text-brand-soft transition-colors" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-2.5 py-3">
                    <div className="w-8 h-8 rounded-md bg-brand/18 flex items-center justify-center shrink-0 group-hover:bg-brand/25 transition-colors">
                      <DocumentTextIcon size={16} className="text-brand-soft" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-foreground leading-[1.3]">Add instructions</div>
                      <div className="text-[10px] text-tertiary-foreground leading-[1.35] mt-0.5">Define personality, rules, and behavior</div>
                    </div>
                    <AltArrowRightIcon size={14} className="text-brand-soft shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </div>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Publish</span>
            <div className="nodrag nopan">
              <div
                role="button"
                tabIndex={0}
                onClick={() => data.onTogglePublish(!data.isPublic)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    data.onTogglePublish(!data.isPublic);
                  }
                }}
                className={`w-full max-w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left border transition-all duration-150 cursor-pointer group ${data.isPublic ? "bg-success/6 border-success/20 hover:border-success/35" : "bg-muted border-border hover:border-border"}`}
              >
                <GlobalIcon size={14} className={data.isPublic ? "shrink-0 text-success" : "shrink-0 text-muted-foreground opacity-50"} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-medium leading-[1.4] ${data.isPublic ? "text-success" : "text-muted-foreground"}`}>{data.isPublic ? "Public" : "Private"}</div>
                  <div className="text-[10px] text-muted-foreground leading-[1.3] mt-0.5 truncate">{data.isPublic ? "Anyone with the link can chat" : "Only you can access this agent"}</div>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Switch size="small" checked={data.isPublic} onChange={data.onTogglePublish} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
