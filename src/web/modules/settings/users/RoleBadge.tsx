import { Tag } from "antd";
import { cn } from "src/lib/utils";

const ROLE_STYLES: Record<string, string> = {
  admin: "border-transparent bg-accent text-accent-foreground",
  member: "border-border bg-secondary text-muted-foreground",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <Tag variant="filled" className={cn("rounded-md capitalize m-0!", ROLE_STYLES[role] ?? ROLE_STYLES.member)}>
      {role}
    </Tag>
  );
}
