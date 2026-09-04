import { Button, Drawer, Empty, Input, Popconfirm, Switch, message } from "@nonla-agents/ui";
import { ClipboardIcon } from "@solar-icons/react/dynamic/clipboard";
import { ClipboardCheckIcon } from "@solar-icons/react/dynamic/clipboard-check";
import { CpuIcon } from "@solar-icons/react/dynamic/cpu";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { RefreshCircleIcon } from "@solar-icons/react/dynamic/refresh-circle";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { WidgetIcon } from "@solar-icons/react/dynamic/widget";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { MyMcpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch } from "src/store/store";
import { deleteMyMcpServer, toMyMcpServerListItem, updateMyMcpServer, upsertMyMcpServerLocal } from "../common/myMcpServersSlice";
import { claudeCodeMcpSnippet, cursorMcpSnippet, mcpEndpointUrl } from "../common/snippets";

const TOKEN_PLACEHOLDER = "ra_mcp_…";

export function MyMcpServerDrawer({
  serverId,
  listItem,
  refreshEpoch,
  onClose,
  onEdit,
  onRotated,
}: {
  serverId: string | null;
  listItem: MyMcpServer | null;
  refreshEpoch?: number;
  onClose: () => void;
  onEdit: (server: MyMcpServer) => void;
  onRotated: (server: MyMcpServer) => void;
}) {
  const dispatch = useAppDispatch();
  const [detail, setDetail] = useState<MyMcpServer | null>(null);
  const [toolQuery, setToolQuery] = useState("");
  const [copied, setCopied] = useState<"url" | "cursor" | "claude" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setToolQuery("");
    setCopied(null);
    setDetail(null);
    if (!serverId) return;
    void apiClient.get<MyMcpServer>(`/api/my-mcp-servers/${serverId}`).then(setDetail);
  }, [serverId, refreshEpoch]);

  const server = detail ?? listItem;
  const tools = detail?.tools ?? [];
  const url = server ? mcpEndpointUrl(server.id) : "";
  const cursor = server ? cursorMcpSnippet(server.name, url, TOKEN_PLACEHOLDER) : "";
  const claude = server ? claudeCodeMcpSnippet(server.name, url, TOKEN_PLACEHOLDER) : "";

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => tool.name.toLowerCase().includes(q) || tool.label.toLowerCase().includes(q) || (tool.description ?? "").toLowerCase().includes(q));
  }, [tools, toolQuery]);

  const copy = async (text: string, which: "url" | "cursor" | "claude") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      message.success("Copied");
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      message.error("Copy failed");
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!server) return;
    setToggling(true);
    try {
      const updated = (await dispatch(updateMyMcpServer({ id: server.id, isActive: checked })).unwrap()) as MyMcpServer;
      dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(updated)));
      setDetail((prev) => (prev ? { ...prev, isActive: checked } : prev));
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(false);
    }
  };

  const handleRotate = async () => {
    if (!server) return;
    setRotating(true);
    try {
      const rotated = await apiClient.post<MyMcpServer>(`/api/my-mcp-servers/${server.id}/rotate-key`);
      dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(rotated)));
      setDetail((prev) => (prev ? { ...prev, keyPrefix: rotated.keyPrefix } : prev));
      onRotated(rotated);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRotating(false);
    }
  };

  const handleDelete = async () => {
    if (!server) return;
    try {
      await dispatch(deleteMyMcpServer(server.id)).unwrap();
      message.success("Deleted");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Drawer
      open={!!serverId}
      onClose={onClose}
      size={440}
      destroyOnHidden
      title={null}
      styles={{
        header: { display: "none" },
        body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" },
      }}
    >
      <RenderIf value={server}>
        {(s) => (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border-subtle px-5 pb-4 pt-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-edge-mcp/12 text-edge-mcp">
                  <CpuIcon weight="BoldDuotone" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 truncate text-lg font-semibold text-foreground">{s.name}</h2>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <p className="m-0 min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary-foreground">{url}</p>
                    <button type="button" onClick={() => void copy(url, "url")} className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none" aria-label="Copy URL">
                      {copied === "url" ? <ClipboardCheckIcon size={13} /> : <ClipboardIcon size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", s.isActive ? "bg-edge-mcp/12 text-edge-mcp" : "bg-muted text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", s.isActive ? "bg-edge-mcp motion-safe:animate-pulse" : "bg-muted-foreground/50")} />
                  {s.isActive ? "Active" : "Off"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                  <WidgetIcon size={12} />
                  {tools.length} tool{tools.length === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Switch size="small" checked={s.isActive} disabled={toggling} onChange={(checked) => void handleToggle(checked)} />
                  <Button type="text" size="small" icon={<PenNewSquareIcon size={14} />} onClick={() => onEdit(detail ?? s)} />
                  <Popconfirm title={`Delete ${s.name}?`} description="Clients using this URL and token will stop working." okText="Delete" okType="danger" onConfirm={() => void handleDelete()} styles={{ root: { width: 280 } }}>
                    <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={14} />} />
                  </Popconfirm>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Cursor mcp.json</div>
                <SnippetMini value={cursor} copied={copied === "cursor"} onCopy={() => void copy(cursor, "cursor")} />
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Claude Code</div>
                <SnippetMini value={claude} copied={copied === "claude"} onCopy={() => void copy(claude, "claude")} />
              </div>
              <p className="m-0 text-[11px] leading-relaxed text-tertiary-foreground">Token is shown only once at create/rotate. Paste it into the Bearer header, then keep this file private.</p>
              <Button icon={<RefreshCircleIcon size={14} />} loading={rotating} onClick={() => void handleRotate()}>
                Rotate token
              </Button>

              <RenderIf condition={tools.length > 0}>
                <Input prefix={<MagnifierIcon size={13} className="text-muted-foreground" />} value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Find tools…" className="h-8! text-sm" allowClear />
              </RenderIf>

              <RenderIf
                condition={tools.length === 0}
                fallback={
                  <RenderIf
                    condition={filteredTools.length === 0}
                    fallback={
                      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {filteredTools.map((tool) => (
                          <li key={tool.id} className="rounded-xl border border-border-subtle bg-card/60 px-3.5 py-3">
                            <div className="truncate text-[13px] font-medium text-foreground">{tool.label || tool.name}</div>
                            <RenderIf condition={!!tool.description?.trim()}>
                              <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-tertiary-foreground">{tool.description}</div>
                            </RenderIf>
                          </li>
                        ))}
                      </ul>
                    }
                  >
                    <Empty className="py-8" description={<span className="text-sm text-muted-foreground">No matching tools</span>} />
                  </RenderIf>
                }
              >
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <WidgetIcon size={18} />
                  </div>
                  <p className="m-0 text-sm font-medium text-foreground">No tools yet</p>
                  <p className="mt-1 m-0 text-xs text-muted-foreground">Edit this server and pick custom tools to expose.</p>
                </div>
              </RenderIf>
            </div>
          </div>
        )}
      </RenderIf>
    </Drawer>
  );
}

function SnippetMini({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-1">
        <pre className="m-0 min-w-0 flex-1 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground">{value}</pre>
        <Button type="text" size="small" className="mt-1 mr-1" icon={copied ? <ClipboardCheckIcon size={13} /> : <ClipboardIcon size={13} />} onClick={onCopy} />
      </div>
    </div>
  );
}
