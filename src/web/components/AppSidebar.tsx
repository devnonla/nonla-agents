import { Dropdown, FluentIcon } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { ArrowLeft, Ellipsis, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getRefreshToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { UserAvatar } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";
import { SETTINGS_TABS } from "src/modules/settings/common/constants";
import { useAppSelector } from "src/store/store";

const SIDEBAR_W = 220;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const WORKSPACE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <FluentIcon name="home-24" size={16} /> },
  { to: "/agents", label: "Agents", icon: <FluentIcon name="bot-sparkle-24" size={16} /> },
  { to: "/tools", label: "Tools", icon: <FluentIcon name="code-24" size={16} /> },
  { to: "/skills", label: "Skills", icon: <FluentIcon name="star-24" size={16} /> },
];

const CAPABILITIES_NAV: NavItem[] = [
  { to: "/sites", label: "Sites", icon: <FluentIcon name="content-view-24" size={16} /> },
  { to: "/jobs", label: "Jobs", icon: <FluentIcon name="shifts-24" size={16} />, adminOnly: true },
];

const RESOURCES_NAV: NavItem[] = [
  { to: "/datatables", label: "Datatables", icon: <FluentIcon name="database-24" size={16} /> },
  { to: "/kvstore", label: "KV Store", icon: <FluentIcon name="person-key-24" size={16} /> },
  { to: "/secrets", label: "Secrets", icon: <FluentIcon name="vault-24" size={16} />, adminOnly: true },
];

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 pt-4 text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">{children}</div>;
}

function SketchDivider({ className }: { className?: string }) {
  return (
    <svg className={cn("mx-3 h-2.5 w-auto shrink-0 text-border", className)} viewBox="0 0 196 10" fill="none" aria-hidden>
      <path d="M1.5 5.2c18.2-2.1 36.4 2.4 54.5.1 12.8-1.6 25.1-3.8 38-.9 14.2 3.2 28.6 1.1 42.4-1.4 13.1-2.4 26.8 1.8 39.9.6 6.8-.6 13.2-2.1 19.7-1.1" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M3 6.4c16.8-.9 33.9 1.6 50.6.2 14.1-1.2 27.8-2.9 42-.4 11.9 2.1 24.1.8 35.8-.7 12.4-1.6 25.2 1.4 37.4.3 8.9-.8 17.4-2.4 26.2-1.2" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function SidebarNavLink({ item, end }: { item: NavItem; end?: boolean }) {
  return (
    <NavLink to={item.to} end={end} title={item.label} className={({ isActive }) => cn("flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-3 text-left text-base font-medium no-underline transition-colors duration-150 cursor-pointer", isActive ? "bg-muted text-brand" : "text-foreground hover:bg-muted")}>
      {({ isActive }) => (
        <>
          <span className={cn("flex size-4 shrink-0 items-center justify-center [&_svg]:block [&_svg]:size-4", isActive ? "text-brand" : "text-tertiary-foreground")}>{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function SettingsPanelHeader({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} aria-label="Back to workspace" className="group mb-2 flex h-8 w-full min-w-0 items-center gap-2 border-0 bg-transparent px-0.5 text-left cursor-pointer">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-tertiary-foreground transition-colors duration-150 group-hover:bg-secondary group-hover:text-foreground">
        <span className="flex size-4 items-center justify-center transition-transform duration-150 group-hover:-translate-x-px motion-reduce:transition-none [&_svg]:size-4">
          <ArrowLeft size={16} />
        </span>
      </span>
      <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">Settings</span>
    </button>
  );
}

function SidebarNavButton({
  label,
  icon,
  active,
  trailing,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-base font-medium transition-colors duration-150 cursor-pointer", active ? "bg-muted text-brand" : "text-foreground hover:bg-muted")}>
      <span className={cn("flex size-4 shrink-0 items-center justify-center [&_svg]:block [&_svg]:size-4", active ? "text-brand" : "text-tertiary-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SidebarProfileLink({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const navigate = useNavigate();
  if (!user) return null;

  const displayName = user.name || user.username;

  const menuItems: MenuProps["items"] = [
    {
      key: "header",
      label: (
        <div className="flex items-center gap-2.5 px-1 py-1">
          <UserAvatar avatar={user.avatar} name={displayName} size={36} className="shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight text-foreground">{displayName}</div>
            <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">@{user.username}</div>
          </div>
        </div>
      ),
      disabled: true,
      style: { cursor: "default", opacity: 1 },
    },
    { type: "divider" },
    {
      key: "profile",
      label: (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-0 text-base text-foreground">
          <FluentIcon name="person-24" size={16} />
          Profile Settings
        </div>
      ),
      onClick: () => navigate("/profile"),
    },
    { type: "divider" },
    {
      key: "logout",
      label: (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-0 text-base text-foreground">
          <LogOut size={16} />
          Log Out
        </div>
      ),
      onClick: onLogout,
    },
  ];

  return (
    <Dropdown trigger={["click"]} placement="topLeft" menu={{ items: menuItems, className: "w-[204px] p-1" }}>
      <button type="button" aria-label="User menu" className="flex w-full min-w-0 items-center gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left text-foreground outline-none transition-colors hover:bg-muted cursor-pointer">
        <UserAvatar avatar={user.avatar} name={displayName} size={32} className="shrink-0 self-center rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium leading-tight text-foreground">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground tabular-nums">v{__APP_VERSION__}</span>
        </span>
        <span className="inline-flex size-8 shrink-0 items-center justify-center self-center rounded-md text-tertiary-foreground">
          <Ellipsis size={16} />
        </span>
      </button>
    </Dropdown>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentUser = useAppSelector((s) => s.auth.user);
  const isAdmin = currentUser?.role === "admin";
  const isSettingsRoute = pathname.startsWith("/settings");
  const [panel, setPanel] = useState<"main" | "settings">(isSettingsRoute ? "settings" : "main");

  useEffect(() => {
    if (isSettingsRoute) setPanel("settings");
  }, [isSettingsRoute]);

  const handleLogout = () => {
    const refreshToken = getRefreshToken();
    void apiClient.post("/api/auth/logout", { refreshToken }).catch(() => {});
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  const openSettings = () => {
    setPanel("settings");
    if (!isSettingsRoute) navigate("/settings/general");
  };

  const backToMain = () => {
    setPanel("main");
    navigate("/");
  };

  return (
    <aside className="flex h-screen shrink-0 flex-col overflow-hidden bg-[#fcf9eb] border-r border-border text-foreground" style={{ width: SIDEBAR_W }}>
      <div className="flex h-12 w-full min-w-0 shrink-0 items-center gap-2.5 px-4">
        <AppLogo size={36} className="shrink-0" />
        <span className="truncate text-base font-semibold tracking-tight text-foreground">Nonla Agents</span>
      </div>
      <SketchDivider className="mb-2" />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={cn("flex h-full w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", panel === "settings" ? "-translate-x-1/2" : "translate-x-0")}>
          <nav className="flex h-full w-1/2 flex-col gap-1 overflow-y-auto px-2.5 pb-4">
            <div className="flex flex-col gap-1">
              {WORKSPACE_NAV.map((item) => (
                <SidebarNavLink key={item.to} item={item} end={item.to === "/"} />
              ))}
            </div>

            <NavSectionLabel>Capabilities</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {CAPABILITIES_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarNavLink key={item.to} item={item} />
              ))}
            </div>

            <NavSectionLabel>Resources</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {RESOURCES_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarNavLink key={item.to} item={item} />
              ))}
            </div>

            {isAdmin && (
              <div className="mt-auto pt-2">
                <SidebarNavButton label="Settings" icon={<FluentIcon name="settings-24" size={16} />} active={isSettingsRoute} onClick={openSettings} />
              </div>
            )}
          </nav>

          <nav className="flex h-full w-1/2 flex-col overflow-y-auto px-2.5 pb-4">
            <SettingsPanelHeader onBack={backToMain} />
            <SketchDivider className="mx-0.5 mb-2" />
            <div className="flex flex-col gap-1">
              {SETTINGS_TABS.map((tab) => (
                <SidebarNavLink
                  key={tab.key}
                  item={{
                    to: `/settings/${tab.key}`,
                    label: tab.label,
                    icon: <FluentIcon name={tab.icon} size={16} />,
                  }}
                />
              ))}
            </div>
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-2 py-2">
        <SidebarProfileLink user={currentUser} onLogout={handleLogout} />
      </div>
    </aside>
  );
}
