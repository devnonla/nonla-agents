import { Button } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { useState } from "react";
import { PageShell } from "src/components/PageShell";
import { MyMcpServersBoard } from "./components/MyMcpServersBoard";

export default function MyMcpServersPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">MCP servers</h1>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">Host MCP servers that expose your tools to other clients.</p>
        </div>
        <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setCreateOpen(true)}>
          New server
        </Button>
      </div>
      <MyMcpServersBoard createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
    </PageShell>
  );
}
