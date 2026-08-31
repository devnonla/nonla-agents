import { message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { authorizedFetch } from "src/common/api";
import type { AgentMemoryResponse } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { MemoryGraphPanel } from "./components/MemoryGraphPanel";

export function MemoryPage() {
  const { id } = useAgentDetailContext();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AgentMemoryResponse | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authorizedFetch(`/api/agents/${id}/memory`);
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as AgentMemoryResponse);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshQuiet = useCallback(async () => {
    if (!id) return;
    try {
      const res = await authorizedFetch(`/api/agents/${id}/memory`);
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as AgentMemoryResponse);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to refresh memory");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="m-0 text-sm text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <RenderIf condition={loading}>
        <div className="flex h-full flex-1 items-center justify-center">
          <p className="m-0 text-sm text-muted-foreground">Loading memory…</p>
        </div>
      </RenderIf>

      <RenderIf condition={!loading && !!data}>
        {() => (
          <div className="min-h-0 min-w-0 flex-1">
            <MemoryGraphPanel agentId={id} data={data!} onRefresh={refreshQuiet} />
          </div>
        )}
      </RenderIf>
    </div>
  );
}
