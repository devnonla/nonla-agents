// ─── Config: MCP Servers Panel ────────────────────────────────────────────────
// Toggle MCP tools grouped by server — tree style like the Tools list page.

import { useMemo } from "react";
import type { McpServer } from "src/common/types";
import { fluentIconRef } from "src/modules/tools/common/iconify";
import { useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { buildMcpGroups } from "../../common/configGroups";
import { ConfigTreeGroup, ConfigTreeRow, toggleGroupItems } from "./ConfigTree";

const MCP_TOOL_ICON = fluentIconRef("cloud-24");

export function ConfigMcpPanel() {
  const { toolAssignments, onToggleTool } = useAgentDetailContext();
  const mcpServers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const groups = useMemo(() => buildMcpGroups({ mcpServers, toolAssignments }), [mcpServers, toolAssignments]);
  const totalCount = useMemo(() => groups.flatMap((g) => g.tools).length, [groups]);

  return (
    <section className="max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      <div className="flex flex-col gap-4">
        {totalCount === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">No MCP tools available</div>
        ) : (
          groups.map((group) => (
            <ConfigTreeGroup key={group.id} icon="puzzle-piece-24" title={group.name} allChecked={group.tools.length > 0 && group.tools.every((t) => t.connected)} onToggleAll={(checked) => toggleGroupItems(group.tools, checked, onToggleTool)}>
              {group.tools.map((tool, index) => (
                <ConfigTreeRow key={tool.id} icon={MCP_TOOL_ICON} label={tool.label} checked={tool.connected} onToggle={(checked) => onToggleTool(tool.id, checked)} isLast={index === group.tools.length - 1} />
              ))}
            </ConfigTreeGroup>
          ))
        )}
      </div>
    </section>
  );
}
