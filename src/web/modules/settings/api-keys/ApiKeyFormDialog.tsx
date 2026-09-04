import { Checkbox, EFormItemType, Input, Modal, SchemaForm, type TFormItemProps } from "@nonla-agents/ui";
import { BotIcon } from "@solar-icons/react/dynamic/bot";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { apiClient } from "src/common/api";
import type { AgentListItem, AgentTeam, ApiKey, DatatableProject, KvStoreEntry } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { ScopePicker, UnrestrictedToggle } from "./ScopePicker";

interface ApiKeyFormDialogProps {
  edit?: ApiKey | null;
  agents: AgentListItem[];
  datatableProjects: DatatableProject[];
  kvEntries: KvStoreEntry[];
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
  onUpdated: (key: ApiKey) => void;
}

interface AgentGroup {
  id: string | null;
  name: string;
  agents: AgentListItem[];
}

function toggleIds(current: string[], ids: string[], checked: boolean): string[] {
  const next = new Set(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

type ApiKeyValues = {
  name: string;
  agentIds: string[];
  agentsUnrestricted: boolean;
  datatableProjectIds: string[];
  datatablesUnrestricted: boolean;
  kvEntryIds: string[];
  kvUnrestricted: boolean;
};

export function ApiKeyFormDialog({ edit, agents, datatableProjects, kvEntries, onClose, onCreated, onUpdated }: ApiKeyFormDialogProps) {
  const isEdit = !!edit;
  const form = useForm<ApiKeyValues>({
    defaultValues: {
      name: edit?.name ?? "",
      agentIds: edit?.agentIds ?? [],
      agentsUnrestricted: edit?.agentsUnrestricted ?? false,
      datatableProjectIds: edit?.datatableProjectIds ?? [],
      datatablesUnrestricted: edit?.datatablesUnrestricted ?? false,
      kvEntryIds: edit?.kvEntryIds ?? [],
      kvUnrestricted: edit?.kvUnrestricted ?? false,
    },
    mode: "onSubmit",
  });
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const rootError = form.formState.errors.root?.message;
  const agentIds = form.watch("agentIds");
  const agentsUnrestricted = form.watch("agentsUnrestricted");
  const datatableProjectIds = form.watch("datatableProjectIds");
  const datatablesUnrestricted = form.watch("datatablesUnrestricted");
  const kvEntryIds = form.watch("kvEntryIds");
  const kvUnrestricted = form.watch("kvUnrestricted");

  useEffect(() => {
    form.reset({
      name: edit?.name ?? "",
      agentIds: edit?.agentIds ?? [],
      agentsUnrestricted: edit?.agentsUnrestricted ?? false,
      datatableProjectIds: edit?.datatableProjectIds ?? [],
      datatablesUnrestricted: edit?.datatablesUnrestricted ?? false,
      kvEntryIds: edit?.kvEntryIds ?? [],
      kvUnrestricted: edit?.kvUnrestricted ?? false,
    });
    setQuery("");
  }, [edit, form]);

  useEffect(() => {
    void apiClient
      .get<{ items: AgentTeam[] }>("/api/teams")
      .then((res) => setTeams(res.items))
      .catch(() => setTeams([]));
  }, []);

  const groups = useMemo<AgentGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;
    const byTeam = new Map<string, AgentListItem[]>();
    const ungrouped: AgentListItem[] = [];
    for (const agent of visible) {
      if (agent.teamId) {
        const list = byTeam.get(agent.teamId) ?? [];
        list.push(agent);
        byTeam.set(agent.teamId, list);
      } else {
        ungrouped.push(agent);
      }
    }

    const named: AgentGroup[] = [...teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => ({
        id: team.id,
        name: team.name,
        agents: (byTeam.get(team.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.agents.length > 0);

    const orphaned = [...byTeam.entries()].filter(([teamId]) => !teams.some((team) => team.id === teamId)).flatMap(([, list]) => list);
    const leftover = [...ungrouped, ...orphaned].sort((a, b) => a.name.localeCompare(b.name));
    if (leftover.length > 0) {
      named.push({ id: null, name: "Ungrouped", agents: leftover });
    }
    return named;
  }, [agents, teams, query]);

  const selected = useMemo(() => new Set(agentIds), [agentIds]);
  const setAgentIds = (next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === "function" ? next(form.getValues("agentIds")) : next;
    form.setValue("agentIds", value);
  };

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Name",
        colSpan: 12,
        rules: {
          required: "Please enter a name",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Please enter a name"),
        },
        options: { placeholder: "e.g. Production bot", autoComplete: "off" },
      },
      {
        type: EFormItemType.Custom,
        name: "agentIds",
        label: "Agents",
        colSpan: 12,
        render: () => (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <UnrestrictedToggle checked={agentsUnrestricted} onChange={(checked) => form.setValue("agentsUnrestricted", checked)} />
            {agentsUnrestricted ? (
              <p className="m-0 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">This key can chat with every agent, including ones created later.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-border p-2">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents" allowClear prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} />
                  <span className="shrink-0 text-[11px] tabular-nums text-tertiary-foreground">{agentIds.length} selected</span>
                </div>
                <div className="max-h-55 overflow-y-auto py-1">
                  {groups.length === 0 ? (
                    <p className="m-0 px-3 py-8 text-center text-sm text-muted-foreground">{agents.length === 0 ? "No agents yet" : "No agents match"}</p>
                  ) : (
                    groups.map((group) => {
                      const ids = group.agents.map((a) => a.id);
                      const checkedCount = ids.filter((id) => selected.has(id)).length;
                      const allChecked = checkedCount === ids.length;
                      const someChecked = checkedCount > 0 && !allChecked;
                      const GroupIcon = group.id ? UsersGroupTwoRoundedIcon : BotIcon;
                      return (
                        <div key={group.id ?? "__ungrouped"} className="pb-1">
                          <div className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40" onClick={() => setAgentIds((prev) => toggleIds(prev, ids, !allChecked))}>
                            <Checkbox checked={allChecked} indeterminate={someChecked} onClick={(e) => e.stopPropagation()} onChange={(checked) => setAgentIds((prev) => toggleIds(prev, ids, checked))} />
                            <GroupIcon size={14} className="shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.name}</span>
                            <span className="text-[11px] tabular-nums text-tertiary-foreground">
                              {checkedCount}/{ids.length}
                            </span>
                          </div>
                          {group.agents.map((agent) => {
                            const checked = selected.has(agent.id);
                            return (
                              <div key={agent.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 pl-8 hover:bg-muted/40" onClick={() => setAgentIds((prev) => toggleIds(prev, [agent.id], !checked))}>
                                <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(checked) => setAgentIds((prev) => toggleIds(prev, [agent.id], checked))} />
                                <UserAvatar avatar={agent.avatar} name={agent.name} size={22} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{agent.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        ),
      },
      {
        type: EFormItemType.Custom,
        name: "datatableProjectIds",
        label: "Datatables",
        colSpan: 12,
        render: () => (
          <ScopePicker
            unrestricted={datatablesUnrestricted}
            onUnrestrictedChange={(checked) => form.setValue("datatablesUnrestricted", checked)}
            items={datatableProjects}
            selectedIds={datatableProjectIds}
            onChange={(ids) => form.setValue("datatableProjectIds", ids)}
            getId={(item) => item.id}
            getLabel={(item) => item.name}
            searchPlaceholder="Search projects"
            emptyText="No datatable projects yet"
            unrestrictedHint="This key can read and write every datatable project, including ones created later."
          />
        ),
      },
      {
        type: EFormItemType.Custom,
        name: "kvEntryIds",
        label: "KV store",
        colSpan: 12,
        render: () => (
          <ScopePicker
            unrestricted={kvUnrestricted}
            onUnrestrictedChange={(checked) => form.setValue("kvUnrestricted", checked)}
            items={kvEntries}
            selectedIds={kvEntryIds}
            onChange={(ids) => form.setValue("kvEntryIds", ids)}
            getId={(item) => item.id}
            getLabel={(item) => item.key}
            searchPlaceholder="Search keys"
            emptyText="No KV entries yet"
            unrestrictedHint="This key can read and write every KV entry, including ones created later."
            renderItem={(item) => <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-foreground">{item.key}</span>}
          />
        ),
      },
    ],
    [agentIds, agents, agentsUnrestricted, datatableProjectIds, datatableProjects, datatablesUnrestricted, form, groups, kvEntries, kvEntryIds, kvUnrestricted, query, selected],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    const payload = {
      name: values.name.trim(),
      agentIds: values.agentIds,
      agentsUnrestricted: values.agentsUnrestricted,
      datatablesUnrestricted: values.datatablesUnrestricted,
      datatableProjectIds: values.datatableProjectIds,
      kvUnrestricted: values.kvUnrestricted,
      kvEntryIds: values.kvEntryIds,
    };
    try {
      if (isEdit && edit) {
        const updated = await apiClient.put<ApiKey>(`/api/api-keys/${edit.id}`, payload);
        onUpdated(updated);
      } else {
        const created = await apiClient.post<ApiKey>("/api/api-keys", payload);
        onCreated(created);
      }
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title={isEdit ? "Edit API key" : "New API key"} onCancel={onClose} onOk={() => void onSubmit()} okText={isEdit ? "Save" : "Create"} confirmLoading={saving} destroyOnHidden width={560} styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}>
      <form onSubmit={onSubmit} className="pt-2">
        <SchemaForm form={form} items={items} />
        {rootError ? <div className="text-[12px] font-medium text-destructive">{rootError}</div> : null}
      </form>
    </Modal>
  );
}
