import { Checkbox, Input } from "@nonla-agents/ui";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { useMemo, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { AgentTool, ToolFolder } from "src/common/types";
import RenderIf from "src/components/RenderIf";

function isCustomTool(tool: AgentTool): boolean {
  return !tool.id.startsWith("builtin:") && !tool.id.startsWith("mcp:");
}

export function CustomToolPicker({
  tools,
  folders,
  selectedIds,
  onChange,
}: {
  tools: AgentTool[];
  folders: ToolFolder[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const custom = useMemo(() => tools.filter(isCustomTool), [tools]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return custom;
    return custom.filter((tool) => tool.name.toLowerCase().includes(q) || tool.label.toLowerCase().includes(q) || (tool.description ?? "").toLowerCase().includes(q));
  }, [custom, query]);

  const groups = useMemo(() => {
    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const byFolder = new Map<string, AgentTool[]>();
    const ungrouped: AgentTool[] = [];
    for (const tool of visible) {
      if (tool.folderId && folderMap.has(tool.folderId)) {
        const list = byFolder.get(tool.folderId) ?? [];
        list.push(tool);
        byFolder.set(tool.folderId, list);
      } else {
        ungrouped.push(tool);
      }
    }
    const orderedFolders = [...folders]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((folder) => ({ folder, tools: byFolder.get(folder.id) ?? [] }))
      .filter((g) => g.tools.length > 0);
    return { orderedFolders, ungrouped };
  }, [visible, folders]);

  const toggle = (ids: string[], checked: boolean) => {
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange([...next]);
  };

  const renderTool = (tool: AgentTool, nested: boolean) => {
    const checked = selected.has(tool.id);
    return (
      <div key={tool.id} className={cn("flex cursor-pointer items-center gap-2 py-1.5 pr-3 hover:bg-muted/60", nested ? "pl-8" : "px-3")} onClick={() => toggle([tool.id], !checked)}>
        <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(checked) => toggle([tool.id], checked)} />
        <span className="min-w-0 truncate text-[13px] text-foreground">{tool.label || tool.name}</span>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find custom tools…" allowClear prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} />
        <span className="shrink-0 text-[11px] tabular-nums text-tertiary-foreground">{selectedIds.length} selected</span>
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        <RenderIf condition={visible.length > 0} fallback={<p className="m-0 px-3 py-6 text-center text-[12px] text-muted-foreground">No custom tools yet. Create one on the Tools page.</p>}>
          {groups.orderedFolders.map(({ folder, tools: folderTools }) => {
            const ids = folderTools.map((t) => t.id);
            const checkedCount = ids.filter((id) => selected.has(id)).length;
            return (
              <div key={folder.id} className="mb-1">
                <div className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" onClick={() => toggle(ids, checkedCount !== ids.length)}>
                  <Checkbox checked={checkedCount === ids.length} indeterminate={checkedCount > 0 && checkedCount < ids.length} onClick={(e) => e.stopPropagation()} onChange={(checked) => toggle(ids, checked)} />
                  {folder.name}
                </div>
                {folderTools.map((tool) => renderTool(tool, true))}
              </div>
            );
          })}
          <RenderIf condition={groups.ungrouped.length > 0}>
            <div>
              <RenderIf condition={groups.orderedFolders.length > 0}>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ungrouped</div>
              </RenderIf>
              {groups.ungrouped.map((tool) => renderTool(tool, groups.orderedFolders.length > 0))}
            </div>
          </RenderIf>
        </RenderIf>
      </div>
    </div>
  );
}
