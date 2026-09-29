import { FluentIcon, Tooltip, DesktopHeader as UiDesktopHeader } from "devnonla-ui";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "src/common/lib/cn";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { UserAvatar } from "src/components/UserAvatar";
import { AgentsMenu } from "./AgentsMenu";
import { DESKTOP_HOME, type DesktopApp, HEADER_APP_ICONS, HEADER_NAV_GROUPS, LEFT_HEADER_APPS, SETTINGS_APP, isDesktopHome, pathIsApp } from "./nav";

function visibleItems(items: DesktopApp[], isAdmin: boolean) {
  return items.filter((item) => !item.adminOnly || isAdmin);
}

function HeaderIconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label} placement="bottom">
      <button type="button" aria-label={label} aria-current={active ? "true" : undefined} onClick={onClick} className={cn("inline-flex size-7 items-center justify-center rounded-md border-0 bg-transparent cursor-pointer transition-colors duration-150", active ? "bg-white/55" : "hover:bg-white/35")}>
        {children}
      </button>
    </Tooltip>
  );
}

function HeaderTextButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn("inline-flex h-7 items-center rounded-md border-0 px-2.5 text-sm font-medium leading-5 cursor-pointer transition-colors duration-150", active ? "bg-white/55 text-foreground" : "bg-transparent text-foreground/85 hover:bg-white/35 hover:text-foreground")}
    >
      {label}
    </button>
  );
}

function HeaderIcon({ name }: { name: string }) {
  return <FluentIcon name={name} size={20} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" />;
}

function TrayDivider() {
  return <span className="mx-0.5 h-4 w-px bg-black/12" aria-hidden />;
}

export function DesktopHeader({
  user,
  selectedTeamId,
  onSelectTeam,
}: {
  user?: User | null;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const displayName = user?.name || user?.username;
  const isAdmin = user?.role === "admin";

  return (
    <UiDesktopHeader
      left={
        <>
          <button type="button" onClick={() => navigate(DESKTOP_HOME)} aria-label="Nonla Agents" className="inline-flex gap-1.5 items-center justify-center rounded-md border-0 bg-transparent cursor-pointer">
            <AppLogo size={28} className="shrink-0" />
          </button>

          {user ? (
            <div className="ml-3 flex items-center gap-2">
              <nav aria-label="Menu" className="flex items-center gap-0.5">
                <AgentsMenu selectedTeamId={selectedTeamId} onSelectTeam={onSelectTeam} active={isDesktopHome(pathname)} />
              </nav>

              <TrayDivider />

              <nav aria-label="Apps" className="ml-1 flex items-center gap-0.5">
                {LEFT_HEADER_APPS.map((item) => (
                  <HeaderTextButton key={item.to} label={item.label} active={pathIsApp(pathname, item.to)} onClick={() => navigate(item.to)} />
                ))}
              </nav>
            </div>
          ) : null}
        </>
      }
      right={
        user ? (
          <>
            <nav aria-label="Workspace" className="mr-3.5 flex items-center gap-1.5">
              {HEADER_NAV_GROUPS.map((group, index) => {
                const items = visibleItems(group.items, isAdmin);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className="contents">
                    {index > 0 ? <TrayDivider /> : null}
                    {items.map((item) => (
                      <HeaderIconButton key={item.to} label={item.label} active={pathIsApp(pathname, item.to)} onClick={() => navigate(item.to)}>
                        <HeaderIcon name={HEADER_APP_ICONS[item.to] ?? "apps-24"} />
                      </HeaderIconButton>
                    ))}
                  </div>
                );
              })}
              {isAdmin ? (
                <>
                  <TrayDivider />
                  <HeaderIconButton label={SETTINGS_APP.label} active={pathIsApp(pathname, "/settings")} onClick={() => navigate(SETTINGS_APP.to)}>
                    <HeaderIcon name={HEADER_APP_ICONS[SETTINGS_APP.to] ?? "settings-24"} />
                  </HeaderIconButton>
                </>
              ) : null}
            </nav>
            <Tooltip title="Profile" placement="bottom">
              <button type="button" aria-label="Profile" onClick={() => navigate("/profile")} className="inline-flex items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none cursor-pointer hover:opacity-90">
                <span className="inline-flex overflow-hidden rounded-full ring-2 ring-white/90">
                  <UserAvatar avatar={user.avatar} name={displayName} size={26} className="shrink-0 rounded-full" />
                </span>
              </button>
            </Tooltip>
          </>
        ) : null
      }
    />
  );
}
