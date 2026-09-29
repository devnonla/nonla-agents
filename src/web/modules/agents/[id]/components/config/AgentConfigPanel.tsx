// ─── Agent Config Panel ───────────────────────────────────────────────────────
// Route: /agents/:id/config — General / Instruct / Tools / MCP / Skills / Call Agents / Memory / Danger zone.

import { FluentIcon, Sidebar, type SidebarItemType } from "devnonla-ui";
import { useEffect, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { ConfigSection } from "../../common/agentDetailContext";
import { MemoryPage } from "../../memory/MemoryPage";
import { PromptPage } from "../../prompt/PromptPage";
import { ConfigCallAgentsPanel } from "./ConfigCallAgentsPanel";
import { ConfigDangerPanel } from "./ConfigDangerPanel";
import { ConfigMcpPanel } from "./ConfigMcpPanel";
import { ConfigRolePanel } from "./ConfigRolePanel";
import { ConfigSkillsPanel } from "./ConfigSkillsPanel";
import { ConfigToolsPanel } from "./ConfigToolsPanel";

const SECTIONS: { id: ConfigSection; label: string; icon: string }[] = [
  { id: "role", label: "General", icon: "person-24" },
  { id: "instruct", label: "Instruct", icon: "notebook-24" },
  { id: "tools", label: "Tools", icon: "toolbox-24" },
  { id: "mcp", label: "MCP Servers", icon: "puzzle-piece-24" },
  { id: "skills", label: "Skills", icon: "design-ideas-24" },
  { id: "agents", label: "Call Agents", icon: "bot-24" },
  { id: "memory", label: "Memory", icon: "data-bar-vertical-ascending-24" },
  { id: "danger", label: "Danger zone", icon: "warning-24" },
];

const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<ConfigSection, (typeof SECTIONS)[number]>;

function item(id: ConfigSection): SidebarItemType {
  const s = byId[id];
  return { key: s.id, label: s.label, icon: s.icon };
}

const SECTION_ITEMS: SidebarItemType[] = [
  { type: "group", key: "agent", label: "Agent", children: [item("role"), item("instruct")] },
  { type: "group", key: "capabilities", label: "Capabilities", children: [item("tools"), item("mcp"), item("skills"), item("agents")] },
  { type: "group", key: "data", label: "Data", children: [item("memory")] },
  { type: "divider" },
  item("danger"),
];

const FULL_BLEED: ConfigSection[] = ["instruct", "memory"];

export function AgentConfigPanel({ onClose, initialSection = "role" }: { onClose: () => void; initialSection?: ConfigSection }) {
  const [section, setSection] = useState<ConfigSection>(initialSection);
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const fullBleed = FULL_BLEED.includes(section);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <Sidebar aria-label="Agent config" className="w-56 shrink-0 border-r border-white/30 bg-white/20" items={SECTION_ITEMS} selectedKey={section} onSelect={({ key }) => setSection(key as ConfigSection)} />

      <section className={cn("min-h-0 min-w-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto overscroll-contain px-6 pb-8 pt-5")}>
        {!fullBleed && (
          <div className="mb-5 flex items-center gap-2">
            <FluentIcon name={active.icon} size={18} className="shrink-0 text-muted-foreground" />
            <h2 className="m-0 text-lg font-semibold leading-tight text-foreground">{active.label}</h2>
          </div>
        )}
        {section === "role" && <ConfigRolePanel />}
        {section === "instruct" && <PromptPage />}
        {section === "tools" && <ConfigToolsPanel />}
        {section === "mcp" && <ConfigMcpPanel />}
        {section === "skills" && <ConfigSkillsPanel />}
        {section === "agents" && <ConfigCallAgentsPanel />}
        {section === "memory" && <MemoryPage />}
        {section === "danger" && <ConfigDangerPanel />}
      </section>
    </div>
  );
}
