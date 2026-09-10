import { Button, Input } from "@nonla-agents/ui";
import { Logout2Icon } from "@solar-icons/react/dynamic/logout-2";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getRefreshToken } from "src/common/api";
import { PageShell } from "src/components/PageShell";
import { SectionRow } from "src/components/SectionRow";
import { useAppSelector } from "src/store/store";
import { AvatarSection } from "./AvatarSection";
import { BasicInfoSection } from "./BasicInfoSection";
import { SecuritySection } from "./SecuritySection";

export default function ProfilePage() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const [avatar, setAvatar] = useState(user?.avatar || "");

  if (!user) return null;

  const handleLogout = () => {
    const refreshToken = getRefreshToken();
    void apiClient.post("/api/auth/logout", { refreshToken }).catch(() => {});
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  return (
    <PageShell>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Profile Settings</h1>
        <Button icon={<Logout2Icon size={14} />} onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <AvatarSection avatar={avatar} name={user.name || user.username} onAvatarChange={setAvatar} />

      <div className="border-t border-border/40" />

      <SectionRow title="Account" description="Your account credentials">
        <div className="max-w-sm space-y-1.5">
          <span className="text-sm text-muted-foreground">Username</span>
          <Input value={user.username} disabled />
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
