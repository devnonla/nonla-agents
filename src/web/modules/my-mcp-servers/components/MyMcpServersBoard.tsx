import { CpuIcon } from "@solar-icons/react/dynamic/cpu";
import { Alert } from "antd";
import { useEffect, useState } from "react";
import type { MyMcpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMyMcpServers, toMyMcpServerListItem, updateMyMcpServer, upsertMyMcpServerLocal } from "../common/myMcpServersSlice";
import { MyMcpServerCard } from "./MyMcpServerCard";
import { MyMcpServerDialog } from "./MyMcpServerDialog";
import { MyMcpServerDrawer } from "./MyMcpServerDrawer";
import { MyMcpTokenDialog } from "./MyMcpTokenDialog";

export function MyMcpServersBoard({ createOpen, onCreateOpenChange }: { createOpen: boolean; onCreateOpenChange: (open: boolean) => void }) {
  const dispatch = useAppDispatch();
  const servers = useAppSelector((s) => s.myMcpServers.items) as MyMcpServer[];

  const [error, setError] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [edit, setEdit] = useState<MyMcpServer | null>(null);
  const [tokenServer, setTokenServer] = useState<MyMcpServer | null>(null);
  const [drawerEpoch, setDrawerEpoch] = useState(0);

  useEffect(() => {
    dispatch(fetchMyMcpServers());
  }, [dispatch]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      const updated = (await dispatch(updateMyMcpServer({ id, isActive })).unwrap()) as MyMcpServer;
      dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(updated)));
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

  const drawerListItem = servers.find((s) => s.id === drawerId) ?? null;

  return (
    <>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-4 border-destructive/30 bg-destructive/10" />
      </RenderIf>

      <RenderIf
        condition={servers.length > 0}
        fallback={
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-edge-mcp/12 text-edge-mcp">
              <CpuIcon weight="BoldDuotone" size={28} />
            </div>
            <p className="mb-1 text-base font-semibold text-foreground">No MCP servers yet</p>
            <p className="m-0 max-w-sm text-center text-sm text-muted-foreground">Pick tools, then connect Cursor or Claude Code.</p>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {servers.map((server) => (
            <MyMcpServerCard key={server.id} server={server} toggling={togglingIds.has(server.id)} onOpen={() => setDrawerId(server.id)} onToggleActive={(checked) => void handleToggleActive(server.id, checked)} />
          ))}
        </div>
      </RenderIf>

      <MyMcpServerDrawer serverId={drawerId} listItem={drawerListItem} refreshEpoch={drawerEpoch} onClose={() => setDrawerId(null)} onEdit={(server) => setEdit(server)} onRotated={setTokenServer} />

      <RenderIf condition={createOpen || edit !== null}>
        <MyMcpServerDialog
          edit={edit}
          onClose={() => {
            onCreateOpenChange(false);
            setEdit(null);
            setDrawerEpoch((n) => n + 1);
          }}
          onCreated={(created) => {
            setTokenServer(created);
            setDrawerId(created.id);
          }}
        />
      </RenderIf>

      <RenderIf condition={!!tokenServer?.key}>
        <MyMcpTokenDialog server={tokenServer!} onClose={() => setTokenServer(null)} />
      </RenderIf>
    </>
  );
}
