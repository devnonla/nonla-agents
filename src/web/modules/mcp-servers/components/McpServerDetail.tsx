import { Alert, Button, Empty, FluentIcon, Popconfirm, SearchInput, Segmented, message } from "devnonla-ui";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch } from "src/store/store";
import { deleteMcpServer, upsertMcpServerLocal } from "../common/mcpServersSlice";
import { McpServerForm } from "./McpServerForm";
import { getServerStatus, toolCountOf } from "./McpServerListItem";

type Tab = "tools" | "connection";

export function McpServerDetail({
  serverId,
  listItem,
  onDeleted,
}: {
  serverId: string;
  listItem: McpServer | null;
  onDeleted: () => void;
}) {
  const dispatch = useAppDispatch();
  const [detail, setDetail] = useState<McpServer | null>(null);
  const [tab, setTab] = useState<Tab>("tools");
  const [toolQuery, setToolQuery] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setTab("tools");
    setToolQuery("");
    setCopiedUrl(false);
    setLoadError("");
    let cancelled = false;
    void apiClient
      .get<McpServer>(`/api/mcp-servers/${serverId}`)
      .then((server) => {
        if (!cancelled) setDetail(server);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const server = detail
    ? {
        ...detail,
        isActive: listItem?.isActive ?? detail.isActive,
        lastSyncError: listItem?.lastSyncError || detail.lastSyncError || null,
        toolCount: listItem?.toolCount ?? detail.toolCount,
      }
    : listItem;
  const tools = detail?.tools ?? listItem?.tools ?? [];
  const tone = server ? getServerStatus(server) : "off";

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => tool.name.toLowerCase().includes(q) || (tool.description ?? "").toLowerCase().includes(q));
  }, [tools, toolQuery]);

  const refreshDetail = async () => {
    const refreshed = await apiClient.get<McpServer>(`/api/mcp-servers/${serverId}`);
    setDetail(refreshed);
    dispatch(upsertMcpServerLocal(refreshed));
    return refreshed;
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiClient.post(`/api/mcp-servers/${serverId}/sync`);
      await refreshDetail();
      message.success("Synced");
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      await refreshDetail().catch(() => {});
    } finally {
      setSyncing(false);
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

  const handleDelete = async () => {
    if (!server) return;
    try {
      await dispatch(deleteMcpServer(server.id)).unwrap();
      message.success("Deleted");
      onDeleted();
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (!server) {
    return loadError ? <Alert type="error" description={loadError} showIcon className="border-destructive/30 bg-destructive/10" /> : null;
  }

  return (
    <div>
      <div className="border-b border-white/40 pb-4">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-lg font-semibold text-foreground">{server.name}</h2>
          <div className="mt-1.5 flex items-center gap-1.5">
            <p className="m-0 min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">{server.url}</p>
            <button type="button" onClick={() => handleCopyUrl(server.url)} className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-white/50 hover:text-foreground focus-visible:outline-none" aria-label="Copy URL">
              {copiedUrl ? <FluentIcon name="clipboard-task-24" size={13} /> : <FluentIcon name="clipboard-24" size={13} />}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", tone === "live" && "bg-brand/15 text-brand-700", tone === "error" && "bg-destructive/12 text-destructive", tone === "off" && "bg-white/70 text-foreground")}>
            <span className={cn("size-1.5 rounded-full", tone === "live" && "bg-brand-700 motion-safe:animate-pulse", tone === "error" && "bg-destructive", tone === "off" && "bg-muted-foreground")} />
            {tone === "live" ? "Live" : tone === "error" ? "Error" : "Off"}
          </span>
          <RenderIf condition={!server.lastSyncError}>
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-muted-foreground">
              <FluentIcon name="apps-24" size={12} />
              {toolCountOf(server)} tool{toolCountOf(server) === 1 ? "" : "s"}
            </span>
          </RenderIf>
          <Button type="default" size="small" className="ml-auto" icon={<RefreshCw size={14} className={syncing ? "animate-spin" : ""} />} loading={syncing} disabled={!server.isActive} onClick={() => void handleSync()}>
            Sync
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Segmented
          size="small"
          className="bg-white/55"
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            { label: "Tools", value: "tools" },
            { label: "Connection", value: "connection" },
          ]}
        />
      </div>

      <div className="mt-4">
        <RenderIf condition={tab === "tools"}>
          <RenderIf condition={!!loadError}>
            <Alert type="error" description={loadError} showIcon className="mb-3 border-destructive/30 bg-destructive/10" />
          </RenderIf>
          <RenderIf condition={!!server.lastSyncError}>
            <Alert type="error" description={server.lastSyncError} showIcon className="mb-3 border-destructive/30 bg-destructive/10" />
          </RenderIf>
          <RenderIf condition={!server.lastSyncError}>
            <RenderIf condition={tools.length > 0}>
              <SearchInput placeholder="Find tools…" className="mb-3 shrink-0 bg-white/70" wait={0} onChange={setToolQuery} />
            </RenderIf>
            <RenderIf
              condition={tools.length === 0}
              fallback={
                <RenderIf
                  condition={filteredTools.length === 0}
                  fallback={
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {filteredTools.map((tool) => (
                        <li key={tool.name} className="rounded-xl border border-white/50 bg-white/70 px-3.5 py-3">
                          <div className="truncate font-mono text-[13px] font-medium text-foreground">{tool.name}</div>
                          <RenderIf condition={!!tool.description?.trim()}>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{tool.description}</div>
                          </RenderIf>
                        </li>
                      ))}
                    </ul>
                  }
                >
                  <Empty className="py-10" description={<span className="text-sm text-muted-foreground">No matching tools</span>} />
                </RenderIf>
              }
            >
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FluentIcon name="apps-24" size={18} />
                </div>
                <p className="m-0 text-sm font-medium text-foreground">No tools yet</p>
                <p className="mt-1 m-0 text-xs text-muted-foreground">Sync this server to pull its tool catalog.</p>
              </div>
            </RenderIf>
          </RenderIf>
        </RenderIf>

        <RenderIf condition={tab === "connection"}>
          <McpServerForm
            key={server.id}
            edit={detail ?? server}
            onSaved={(saved) => {
              setDetail(saved);
              dispatch(upsertMcpServerLocal(saved));
            }}
          />
          <div className="mt-8 border-t border-white/40 pt-4">
            <Popconfirm title={`Delete ${server.name}?`} description="Agents using tools from this server will lose those assignments." okText="Delete" okType="danger" onConfirm={() => void handleDelete()} styles={{ root: { width: 280 } }}>
              <Button type="default" danger icon={<X size={14} />}>
                Delete
              </Button>
            </Popconfirm>
          </div>
        </RenderIf>
      </div>
    </div>
  );
}
