// ─── Config: Tools Panel ──────────────────────────────────────────────────────
// Toggle tools grouped by builtin / datatables / folders — tree style like the
// Tools list page.

import { useMemo } from "react";
import type { AgentTool } from "src/common/types";
import { fluentIconRef } from "src/modules/tools/common/iconify";
import { useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { buildToolGroups } from "../../common/configGroups";
import { ConfigTreeGroup, ConfigTreeRow, toggleGroupItems } from "./ConfigTree";

const DATATABLE_ICON = fluentIconRef("database-24");

function groupIcon(groupId: string | null): string {
  if (groupId === "__builtin__") return "wrench-24";
  if (groupId === "__datatables__") return "database-24";
  return "toolbox-24";
}

export function ConfigToolsPanel() {
  const { toolAssignments, onToggleTool } = useAgentDetailContext();
  const allTools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const toolFolders = useAppSelector((s) => s.toolFolders.folders);
  const datatableProjects = useAppSelector((s) => s.datatableProjects.items);

  const groups = useMemo(() => buildToolGroups({ allTools, toolFolders, toolAssignments, datatableProjects }), [allTools, toolFolders, toolAssignments, datatableProjects]);
  const totalCount = useMemo(() => groups.flatMap((g) => g.tools).length, [groups]);

  return (
    <section className="max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      <div className="flex flex-col gap-4">
        {totalCount === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">No tools available</div>
        ) : (
          groups.map((group) => {
            const isDatatables = group.id === "__datatables__";
            return (
              <ConfigTreeGroup key={group.id ?? group.name} icon={groupIcon(group.id)} title={group.name} allChecked={group.tools.length > 0 && group.tools.every((t) => t.connected)} onToggleAll={(checked) => toggleGroupItems(group.tools, checked, onToggleTool)} note={group.note}>
                {group.tools.map((tool, index) => (
                  <ConfigTreeRow key={tool.id} icon={isDatatables ? DATATABLE_ICON : tool.icon} label={tool.label} checked={tool.connected} onToggle={(checked) => onToggleTool(tool.id, checked)} isLast={index === group.tools.length - 1} />
                ))}
              </ConfigTreeGroup>
            );
          })
        )}
      </div>
    </section>
  );
}
