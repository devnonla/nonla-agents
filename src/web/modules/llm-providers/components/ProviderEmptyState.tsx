import { KeyIcon } from "@solar-icons/react/dynamic/key";
import { Empty } from "antd";

export function ProviderEmptyState() {
  return <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" image={<KeyIcon size={40} weight="BoldDuotone" className="text-muted-foreground" />} styles={{ image: { height: 40 } }} description="No providers yet" />;
}
