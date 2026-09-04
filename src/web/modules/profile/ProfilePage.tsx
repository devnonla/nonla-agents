import { Input } from "@nonla-agents/ui";
import { useState } from "react";
import { PageShell } from "src/components/PageShell";
import { SectionRow } from "src/components/SectionRow";
import { useAppSelector } from "src/store/store";
import { AvatarSection } from "./AvatarSection";
import { BasicInfoSection } from "./BasicInfoSection";
import { SecuritySection } from "./SecuritySection";

export default function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  const [avatar, setAvatar] = useState(user?.avatar || "");

  if (!user) return null;

  return (
    <PageShell>
      <div className="mb-2">
        <h1 className="text-xl font-display font-semibold text-foreground">Profile Settings</h1>
      </div>

      <AvatarSection avatar={avatar} name={user.name || user.username} onAvatarChange={setAvatar} />

      <div className="border-t border-border/40" />

      <SectionRow title="Account" description="Your account credentials">
        <div className="max-w-sm space-y-1.5">
          <span className="text-sm text-muted-foreground">Username</span>
          <Input value={user.username} disabled className="bg-card/50 opacity-60" />
          <p className="text-[10px] text-muted-foreground italic">Username cannot be changed.</p>
        </div>
      </SectionRow>

      <div className="border-t border-border/40" />

      <BasicInfoSection user={user} avatar={avatar} />

      <div className="border-t border-border/40" />

      <SecuritySection />
    </PageShell>
  );
}
