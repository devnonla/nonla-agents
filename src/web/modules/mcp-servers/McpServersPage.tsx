import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { ClipboardIcon } from "@solar-icons/react/dynamic/clipboard";
import { ClipboardCheckIcon } from "@solar-icons/react/dynamic/clipboard-check";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { PlugCircleIcon } from "@solar-icons/react/dynamic/plug-circle";
import { RefreshCircleIcon } from "@solar-icons/react/dynamic/refresh-circle";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { WidgetIcon } from "@solar-icons/react/dynamic/widget";
import { Alert, Button, Drawer, Empty, Input, Popconfirm, Segmented, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { RawButton } from "src/components/RawButton";
import RenderIf from "src/components/RenderIf";
import { MyMcpServersBoard } from "src/modules/my-mcp-servers/components/MyMcpServersBoard";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteMcpServer, fetchMcpServers, updateMcpServer } from "./common/mcpServersSlice";
import { McpServerCard, getServerStatus, toolCountOf } from "./components/McpServerCard";
import { McpServerDialog } from "./components/McpServerDialog";

export default function McpServersPage() {
  const dispatch = useAppDispatch();
  const servers = useAppSelector((s) => s.mcpServers.items) as McpServer[];
  const [tab, setTab] = useState<"remote" | "mine">("remote");
  const [mineCreateOpen, setMineCreateOpen] = useState(false);

  const [error, setError] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [dialog, setDialog] = useState<"create" | McpServer | null>(null);

  useEffect(() => {
    if (tab === "remote") dispatch(fetchMcpServers());
  }, [dispatch, tab]);

  useEffect(() => {
    setToolQuery("");
    setCopiedUrl(false);
  }, [drawerId]);

  const drawerServer = servers.find((s) => s.id === drawerId) ?? null;
  const tools = drawerServer?.tools ?? [];

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => tool.name.toLowerCase().includes(q) || (tool.description ?? "").toLowerCase().includes(q));
  }, [tools, toolQuery]);

  const handleSync = async (id: string) => {
    setSyncingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await apiClient.post(`/api/mcp-servers/${id}/sync`);
      message.success("Synced");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      dispatch(fetchMcpServers());
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await dispatch(updateMcpServer({ id, isActive })).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      dispatch(fetchMcpServers());
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (server: McpServer) => {
    try {
      await dispatch(deleteMcpServer(server.id)).unwrap();
      message.success("Deleted");
      if (drawerId === server.id) setDrawerId(null);
      await dispatch(fetchMcpServers());
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      message.success("Copied");
      window.setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      message.error("Copy failed");
    }
  };

  const drawerTone = drawerServer ? getServerStatus(drawerServer) : "off";

  return (
    <PageShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">MCP servers</h1>
          <div className="mt-3">
            <Segmented
              value={tab}
              onChange={(value) => setTab(value as "remote" | "mine")}
              options={[
                { label: "Remote", value: "remote" },
                { label: "My servers", value: "mine" },
              ]}
            />
          </div>
        </div>
        {tab === "remote" ? (
          <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialog("create")}>
            Add
          </Button>
        ) : (
          <RawButton type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setMineCreateOpen(true)}>
            New server
          </RawButton>
        )}
      </div>

      {tab === "mine" ? (
        <MyMcpServersBoard createOpen={mineCreateOpen} onCreateOpenChange={setMineCreateOpen} />
      ) : (
        <>
          <RenderIf condition={!!error}>
            <Alert type="error" description={error} showIcon className="mb-4 border-destructive/30 bg-destructive/10" />
          </RenderIf>

          <RenderIf
            condition={servers.length > 0}
            fallback={
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-edge-mcp/12 text-edge-mcp">
                  <PlugCircleIcon weight="BoldDuotone" size={28} />
                </div>
                <p className="mb-1 text-base font-semibold text-foreground">No servers yet</p>
                <p className="m-0 max-w-sm text-center text-sm text-muted-foreground">Add a remote MCP endpoint to expose its tools to your agents.</p>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {servers.map((server) => (
                <McpServerCard key={server.id} server={server} toggling={togglingIds.has(server.id)} onOpen={() => setDrawerId(server.id)} onToggleActive={(checked) => handleToggleActive(server.id, checked)} />
              ))}
            </div>
          </RenderIf>

          <Drawer
            open={!!drawerServer}
            onClose={() => setDrawerId(null)}
            size={440}
            destroyOnHidden
            title={null}
            styles={{
              header: { display: "none" },
              body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" },
            }}
          >
            <RenderIf value={drawerServer}>
              {(server) => (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="shrink-0 border-b border-border-subtle px-5 pb-4 pt-5">
                    <div className="flex items-start gap-3">
                      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", drawerTone === "live" && "bg-edge-mcp/12 text-edge-mcp", drawerTone === "error" && "bg-destructive/12 text-destructive", drawerTone === "off" && "bg-muted text-muted-foreground")}>
                        <PlugCircleIcon weight="BoldDuotone" size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="m-0 truncate text-lg font-semibold text-foreground">{server.name}</h2>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <p className="m-0 min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary-foreground">{server.url}</p>
                          <button type="button" onClick={() => handleCopyUrl(server.url)} className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none" aria-label="Copy">
                            {copiedUrl ? <ClipboardCheckIcon size={13} /> : <ClipboardIcon size={13} />}
                          </button>
                        </div>
                      </div>
                      <Button type="default" size="small" icon={<RefreshCircleIcon size={14} className={syncingIds.has(server.id) ? "animate-spin" : ""} />} loading={syncingIds.has(server.id)} disabled={!server.isActive} onClick={() => handleSync(server.id)}>
                        Sync
                      </Button>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", drawerTone === "live" && "bg-edge-mcp/12 text-edge-mcp", drawerTone === "error" && "bg-destructive/12 text-destructive", drawerTone === "off" && "bg-muted text-muted-foreground")}>
                        <span className={cn("size-1.5 rounded-full", drawerTone === "live" && "bg-edge-mcp motion-safe:animate-pulse", drawerTone === "error" && "bg-destructive", drawerTone === "off" && "bg-muted-foreground/50")} />
                        {drawerTone === "live" ? "Live" : drawerTone === "error" ? "Error" : "Off"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                        <WidgetIcon size={12} />
                        {toolCountOf(server)} tool{toolCountOf(server) === 1 ? "" : "s"}
                      </span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <Button type="text" size="small" icon={<PenNewSquareIcon size={14} />} onClick={() => setDialog(server)} />
                        <Popconfirm title={`Delete ${server.name}?`} description="Agents using tools from this server will lose those assignments." okText="Delete" okType="danger" onConfirm={() => handleDelete(server)} styles={{ root: { width: 280 } }}>
                          <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={14} />} />
                        </Popconfirm>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
                    <RenderIf condition={!!server.lastSyncError && server.isActive}>
                      <Alert type="error" description={server.lastSyncError} showIcon className="border-destructive/30 bg-destructive/10" />
                    </RenderIf>

                    <RenderIf condition={tools.length > 0}>
                      <Input prefix={<MagnifierIcon size={13} className="text-muted-foreground" />} value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Find tools…" className="h-8! text-sm" allowClear />
                    </RenderIf>

                    <RenderIf
                      condition={tools.length === 0}
                      fallback={
                        <RenderIf
                          condition={filteredTools.length === 0}
                          fallback={
                            <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-0">
                              {filteredTools.map((tool) => (
                                <li key={tool.name} className="rounded-xl border border-border-subtle bg-card/60 px-3.5 py-3 transition-colors hover:border-edge-mcp/25 hover:bg-edge-mcp/5">
                                  <div className="truncate font-mono text-[13px] font-medium text-foreground">{tool.name}</div>
                                  <RenderIf condition={!!tool.description?.trim()}>
                                    <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-tertiary-foreground">{tool.description}</div>
                                  </RenderIf>
                                </li>
                              ))}
                            </ul>
                          }
                        >
                          <Empty className="py-10" image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-sm text-muted-foreground">No matching tools</span>} />
                        </RenderIf>
                      }
                    >
                      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <WidgetIcon size={18} />
                        </div>
                        <p className="m-0 text-sm font-medium text-foreground">No tools yet</p>
                        <p className="mt-1 m-0 text-xs text-muted-foreground">Sync this server to pull its tool catalog.</p>
                      </div>
                    </RenderIf>
                  </div>
                </div>
              )}
            </RenderIf>
          </Drawer>

          <RenderIf condition={dialog !== null}>
            <McpServerDialog edit={dialog === "create" ? null : dialog} onClose={() => setDialog(null)} />
          </RenderIf>
        </>
      )}
    </PageShell>
  );
}
