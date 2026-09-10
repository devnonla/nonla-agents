import { Alert, Button, Empty } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { PlugCircleIcon } from "@solar-icons/react/dynamic/plug-circle";
import { useEffect, useState } from "react";
import type { McpServer } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMcpServers, updateMcpServer } from "./common/mcpServersSlice";
import { McpServerDetail } from "./components/McpServerDetail";
import { McpServerForm } from "./components/McpServerForm";
import { McpServerListItem } from "./components/McpServerListItem";

type Panel = { type: "create" } | { type: "server"; id: string };

export default function McpServersPage() {
  const dispatch = useAppDispatch();
  const servers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const [error, setError] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    dispatch(fetchMcpServers());
  }, [dispatch]);

  useEffect(() => {
    if (panel?.type === "create") return;
    if (panel?.type === "server" && servers.some((s) => s.id === panel.id)) return;
    setPanel(servers[0] ? { type: "server", id: servers[0].id } : null);
  }, [servers, panel]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await dispatch(updateMcpServer({ id, isActive })).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const selected = panel?.type === "server" ? (servers.find((s) => s.id === panel.id) ?? null) : null;

  return (
    <PageShell className="h-full min-h-0 overflow-hidden pt-0 pb-0 px-0" contentClassName="max-w-none h-full min-h-0">
      <div className="flex h-full min-h-0">
        <aside className="h-full w-72 shrink-0 overflow-y-auto overscroll-contain border-r border-white/30 bg-white/20">
          <div className="px-4 pb-3 pt-5">
            <h1 className="m-0 text-base font-semibold leading-tight text-foreground">Connect MCP</h1>
            <p className="mt-1 mb-3 text-[12px] leading-snug text-foreground/70">Remote servers for agent tools.</p>
            <Button type="primary" size="small" icon={<AddCircleIcon size={14} />} onClick={() => setPanel({ type: "create" })}>
              Add
            </Button>
          </div>
          <div className="px-2 pb-3">
            <RenderIf condition={!!error}>
              <Alert type="error" description={error} showIcon className="mx-1 mb-2 border-destructive/30 bg-destructive/10" />
            </RenderIf>
            <RenderIf condition={servers.length > 0} fallback={<Empty className="px-2 py-10" description={<span className="text-sm text-muted-foreground">No servers yet</span>} />}>
              <div className="flex flex-col gap-0.5">
                {servers.map((server) => (
                  <McpServerListItem key={server.id} server={server} selected={panel?.type === "server" && panel.id === server.id} toggling={togglingIds.has(server.id)} onSelect={() => setPanel({ type: "server", id: server.id })} onToggleActive={(checked) => void handleToggleActive(server.id, checked)} />
                ))}
              </div>
            </RenderIf>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
          {panel?.type === "create" ? (
            <>
              <h2 className="mt-0 mb-4 text-lg font-semibold text-foreground">Add MCP server</h2>
              <McpServerForm key="create" onCancel={() => setPanel(servers[0] ? { type: "server", id: servers[0].id } : null)} onSaved={(created) => setPanel({ type: "server", id: created.id })} />
            </>
          ) : panel?.type === "server" ? (
            <McpServerDetail key={panel.id} serverId={panel.id} listItem={selected} onDeleted={() => setPanel(null)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <PlugCircleIcon size={18} />
              </div>
              <p className="m-0 text-sm font-medium text-foreground">Select a server</p>
              <p className="mt-1 m-0 max-w-xs text-xs text-muted-foreground">Pick one on the left, or add a remote MCP server.</p>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
