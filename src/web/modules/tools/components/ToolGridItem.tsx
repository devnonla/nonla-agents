import { LockIcon } from "@solar-icons/react/dynamic/lock";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import type { AgentTool } from "src/common/types";
import { ToolIcon } from "./ToolIcon";

export function ToolTableRow({
  tool,
  onClick,
}: {
  tool: AgentTool;
  onClick?: () => void;
}) {
  const isBuiltin = tool.id.startsWith("builtin:");
  const isActive = tool.isActive;
  const FallbackIcon = isBuiltin ? LockIcon : ProgrammingIcon;

  const paramCount = (() => {
    const schema = tool.parameters as { properties?: Record<string, unknown> };
    return Object.keys(schema?.properties ?? {}).length;
  })();

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper {...(onClick && { type: "button" as const, onClick })} className={["group flex items-center gap-4 w-full px-4 py-3 text-left transition-all duration-150 border-b border-border/40", onClick ? "cursor-pointer hover:bg-primary/3" : "cursor-default"].join(" ")}>
      {/* Icon */}
      <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isBuiltin ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"].join(" ")}>
        <ToolIcon icon={tool.icon} size={16} fallback={<FallbackIcon size={16} />} />
      </div>

      <span className={["flex-1 min-w-0 text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-150", !isBuiltin && !isActive ? "opacity-90" : ""].join(" ")}>{tool.label}</span>

      {/* Params */}
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums w-20 text-right">{paramCount > 0 ? `${paramCount} param${paramCount !== 1 ? "s" : ""}` : "—"}</span>

      {/* Status */}
      <div className="shrink-0 w-24 flex justify-end">
        {isBuiltin ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success">Built-in</span>
        ) : (
          <span className={["inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold", isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"].join(" ")}>
            <span className={["w-1.5 h-1.5 rounded-full", isActive ? "bg-success" : "bg-muted"].join(" ")} />
            {isActive ? "Active" : "Inactive"}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
