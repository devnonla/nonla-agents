import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
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

type AgentModelValue = {
  providerId: string | null;
  model: string;
};

type NewAgentValues = {
  name: string;
  teamId: string;
  model: AgentModelValue;
};

function getLatestAgentModel(agents: AgentListItem[]): AgentModelValue {
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

function emptyValues(teamId = "", model: AgentModelValue = { providerId: null, model: "" }): NewAgentValues {
  return { name: "", teamId, model };
}

export function NewAgentDialog({ defaultTeamId, children }: NewAgentDialogProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<NewAgentValues>({ defaultValues: emptyValues(defaultTeamId ?? ""), mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    if (!open) return;
    form.reset(emptyValues(defaultTeamId ?? "", getLatestAgentModel(agentsRef.current)));
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, defaultTeamId, form]);

  const handleClose = () => setOpen(false);

  const items = useMemo<TFormItemProps[]>(
    () => [
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Agent Name",
        colSpan: 12,
        rules: {
          required: "Please enter an agent name",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Please enter an agent name"),
        },
        options: { placeholder: "e.g. Research Bot, Support Agent…", autoComplete: "off" },
      },
      {
        type: EFormItemType.Select,
        name: "teamId",
        label: "Team",
        colSpan: 12,
        choices: teams.map((t: AgentTeam) => ({ value: t.id, label: t.name })),
        options: { placeholder: "No team", allowClear: true },
      },
      {
        type: EFormItemType.Custom,
        name: "model",
        label: "Model",
        colSpan: 12,
        rules: {
          required: "Please select a model",
          validate: (value) => {
            const model = value && typeof value === "object" ? (value as AgentModelValue).model : "";
            return model ? true : "Please select a model";
          },
        },
        render: ({ field }) => {
          const value = (field.value as AgentModelValue | undefined) ?? { providerId: null, model: "" };
          return <ModelPicker selectedProviderId={value.providerId} selectedModel={value.model} onChange={(providerId, model) => field.onChange({ providerId, model })} />;
        },
      },
    ],
    [teams],
  );

  const onSubmit = form.handleSubmit(async ({ name, teamId, model }) => {
    setSaving(true);
    try {
      await dispatch(
        createAgent({
          name: name.trim(),
          avatar: JSON.stringify(genConfig()),
          aiProvider: model.providerId,
          aiModel: model.model,
          ...(teamId ? { teamId } : {}),
        }),
      ).unwrap();
      message.success("Agent created");
      handleClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Failed to create agent" });
    } finally {
      setSaving(false);
    }
  });

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
            <Button type="text" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" form="new-agent-form" loading={saving}>
              {saving ? "Creating…" : "Create Agent"}
            </Button>
          </div>
        }
      >
        <form id="new-agent-form" className="pt-4" onSubmit={onSubmit}>
          <SchemaForm form={form} items={items} />
          {rootError ? <div className="mt-4 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}
        </form>
      </Modal>
    </>
  );
}

export { NewAgentDialog as NewAgentPopover };
