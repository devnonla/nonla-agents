import { AddIcon } from "@solar-icons/react/dynamic/add";
import { Button, Form, Input, Modal, Select } from "antd";
import type { InputRef } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AgentListItem, AgentTeam } from "src/common/types";
import { ModelPicker } from "src/components/ModelPicker";
import { genConfig } from "src/components/UserAvatar";
import { createAgent } from "src/modules/agents/common/agentsSlice";

import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

interface NewAgentDialogProps {
  defaultTeamId?: string | null;
  children: ReactNode;
}

function getLatestAgentModel(agents: AgentListItem[]): { providerId: string | null; model: string } {
  let latest: AgentListItem | null = null;
  let latestTs = -1;
  for (const agent of agents) {
    if (!agent.aiModel) continue;
    const ts = agent.createdAt ? new Date(agent.createdAt).getTime() : 0;
    if (ts > latestTs) {
      latestTs = ts;
      latest = agent;
    }
  }
  return {
    providerId: latest?.aiProvider ?? null,
    model: latest?.aiModel ?? "",
  };
}

export function NewAgentDialog({ defaultTeamId, children }: NewAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dispatch = useAppDispatch();
  const nameRef = useRef<InputRef>(null);

  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    if (open) {
      const lastModel = getLatestAgentModel(agentsRef.current);
      setName("");
      setSelectedProviderId(lastModel.providerId);
      setAiModel(lastModel.model);
      setTeamId(defaultTeamId ?? "");
      setError("");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, defaultTeamId]);

  const handleClose = () => setOpen(false);

  const handleModelChange = (providerId: string, model: string) => {
    setSelectedProviderId(providerId);
    setAiModel(model);
    if (error) setError("");
  };

  const handleTeamChange = (value: string) => {
    setTeamId(value);
    if (error) setError("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter an agent name");
      nameRef.current?.focus();
      return;
    }
    if (!aiModel) {
      setError("Please select a model");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(
        createAgent({
          name: name.trim(),
          avatar: JSON.stringify(genConfig()),
          aiProvider: selectedProviderId,
          aiModel,
          ...(teamId ? { teamId } : {}),
        }),
      ).unwrap();
      handleClose();
    } catch {
      setError("Failed to create agent");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleCreate();
    }
  };

  const teamOptions = [{ value: "", label: "No team" }, ...teams.map((t: AgentTeam) => ({ value: t.id, label: t.name }))];

  return (
    <>
      <span className="inline-flex" onClick={() => setOpen(true)}>
        {children}
      </span>

      <Modal
        open={open}
        onCancel={handleClose}
        title={
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
              <div className="text-[14px] leading-none text-muted-foreground">
                <AddIcon size={16} />
              </div>
            </div>
            <span className="truncate font-semibold text-foreground">New Agent</span>
          </div>
        }
        width={420}
        destroyOnHidden
        footer={
          <div className="flex justify-end gap-2.5">
            <Button type="text" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Agent"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-4">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Agent Name<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input
              ref={nameRef}
              id="new-agent-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Research Bot, Support Agent…"
              autoComplete="off"
            />
          </Form.Item>

          <Form.Item label={<span className="text-muted-foreground">Team</span>} className="mb-0!" layout="vertical">
            <Select value={teamId} onChange={handleTeamChange} options={teamOptions} placeholder="Select team…" className="w-full" />
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                Model<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <ModelPicker selectedProviderId={selectedProviderId} selectedModel={aiModel} onChange={handleModelChange} />
          </Form.Item>

          {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
        </div>
      </Modal>
    </>
  );
}

export { NewAgentDialog as NewAgentPopover };
