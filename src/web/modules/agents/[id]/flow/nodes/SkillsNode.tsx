import { Popover, Switch } from "@nonla-agents/ui";
import { CloseCircleIcon } from "@solar-icons/react/dynamic/close-circle";
import { StarsIcon } from "@solar-icons/react/dynamic/stars";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";

export type SkillToggleItem = {
  id: string;
  label: string;
  connected: boolean;
};

export type SkillsNodeData = {
  skills: SkillToggleItem[];
  width?: number;
  onToggleSkill: (skillId: string, enable: boolean) => void;
};

export type SkillsNodeType = Node<SkillsNodeData, "skills">;

const SKILL_COLOR = "var(--edge-skill)";

export function SkillsNode({ data }: NodeProps<SkillsNodeType>) {
  const [open, setOpen] = useState(false);

  const { connectedCount, totalCount } = useMemo(
    () => ({
      connectedCount: data.skills.filter((s) => s.connected).length,
      totalCount: data.skills.length,
    }),
    [data.skills],
  );

  const hasConnection = connectedCount > 0;

  return (
    <div className="relative" style={data.width ? { width: data.width } : undefined}>
      <Handle id="to-config" type="source" position={Position.Left} className="w-1.5! h-1.5! bg-transparent! border-0! opacity-0! left-0!" />

      {hasConnection && <Handle id="to-skills" type="source" position={Position.Right} className="border-0! bg-transparent!" style={{ top: "50%", right: 0, width: 1, height: 1, opacity: 0, transform: "translate(50%, -50%)" }} />}

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="right"
        arrow={{ pointAtCenter: true }}
        styles={{
          root: { width: 340 },
          container: {
            width: 340,
            padding: 0,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--edge-skill) 45%, transparent)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)",
            background: "var(--popover)",
          },
        }}
        content={
          <div className="nodrag nowheel nopan w-85">
            <div
              className="flex items-center gap-2.5 border-b px-3.5 py-3"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--edge-skill) 18%, transparent), color-mix(in srgb, var(--edge-skill) 8%, transparent))",
                borderBottomColor: "color-mix(in srgb, var(--edge-skill) 35%, transparent)",
              }}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] ring-1 ring-edge-skill/25" style={{ background: "color-mix(in srgb, var(--edge-skill) 22%, transparent)", color: SKILL_COLOR }}>
                <StarsIcon weight="BoldDuotone" size={15} />
              </div>
              <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">Skills</div>
              <button type="button" className="nodrag nopan flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground" aria-label="Close" onClick={() => setOpen(false)}>
                <CloseCircleIcon size={16} />
              </button>
            </div>

            <div className="max-h-105 overflow-y-auto py-1.5">
              {totalCount === 0 ? (
                <div className="px-3.5 py-6 text-center text-[12px] text-muted-foreground">No skills yet — create some in Skills</div>
              ) : (
                data.skills.map((skill) => (
                  <div key={skill.id} className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-muted/40">
                    <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{skill.label}</div>
                    <Switch size="small" checked={skill.connected} onChange={(checked) => data.onToggleSkill(skill.id, checked)} />
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <button type="button" className={`nodrag nopan relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-card px-2 py-3 text-center font-[inherit] transition-colors duration-150 hover:bg-muted/30 ${hasConnection ? "border-edge-skill/40" : "border-border"}`}>
          <StarsIcon weight="BoldDuotone" size={20} style={{ color: SKILL_COLOR }} />
          <div className="w-full text-[11px] font-semibold leading-tight text-foreground">Skills</div>
        </button>
      </Popover>
    </div>
  );
}
