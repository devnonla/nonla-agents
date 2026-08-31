import { StarsIcon } from "@solar-icons/react/dynamic/stars";
import { Empty } from "antd";

export function SkillsEmptyState() {
  return <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" image={<StarsIcon size={40} weight="BoldDuotone" className="text-muted-foreground" />} styles={{ image: { height: 40 } }} description="No skills yet" />;
}
