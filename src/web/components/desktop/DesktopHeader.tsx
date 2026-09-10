import { Popover, Tooltip } from "@nonla-agents/ui";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { FluentIcon } from "src/components/FluentIcon";
import { UserAvatar } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";
import { AgentsMenu } from "./AgentsMenu";
import { type DesktopApp, HEADER_NAV_GROUPS, LEFT_HEADER_APPS, headerPathIsApp, pathIsApp } from "./nav";

const HEADER_ICONS: Record<string, string> = {
  "/sites": "globe-24",
  "/jobs": "calendar-clock-24",
  "/my-mcp-servers": "planet-24",
  "/datatables": "database-24",
  "/kvstore": "book-database-24",
  "/secrets": "vault-24",
};

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
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        className={cn("inline-flex size-8 items-center justify-center rounded-full border-0 bg-transparent cursor-pointer", active ? "bg-[rgb(40_32_16/0.08)] text-foreground" : "text-foreground/65 hover:bg-[rgb(40_32_16/0.06)] hover:text-foreground")}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function HeaderMenuItem({
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
      className={cn("inline-flex h-7 items-center rounded-md border-0 bg-transparent px-2.5 text-sm font-medium leading-5 cursor-pointer", active ? "bg-[rgb(40_32_16/0.08)] text-foreground" : "text-foreground/85 hover:bg-[rgb(40_32_16/0.06)] hover:text-foreground")}
    >
      {label}
    </button>
  );
}

function HeaderDivider() {
  return <span className="mx-2 h-4 w-px bg-[rgb(40_32_16/0.14)]" aria-hidden />;
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
  const settingsActive = pathIsApp(pathname, "/settings");

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-10.5 items-center justify-between gap-3 border-0 bg-[rgb(247_244_232/0.40)] px-3 backdrop-blur-lg">
      <div className="flex min-w-0 items-center">
        <Popover
          trigger="hover"
          placement="bottomLeft"
          mouseEnterDelay={0.15}
          mouseLeaveDelay={0.1}
          contentClassName="px-2.5 py-2"
          content={
            <div className="flex items-center gap-2">
              <AppLogo size={20} className="shrink-0" />
              <span className="text-sm font-medium leading-none text-foreground">Nonla Agents</span>
            </div>
          }
        >
          <button type="button" onClick={() => navigate("/")} aria-label="Nonla Agents" className="inline-flex size-8 items-center justify-center rounded-md border-0 bg-transparent cursor-pointer hover:bg-[rgb(40_32_16/0.06)]">
            <AppLogo size={28} className="shrink-0" />
          </button>
        </Popover>

        {user ? (
          <nav aria-label="Menu" className="ml-3 flex items-center gap-0.5">
            <AgentsMenu selectedTeamId={selectedTeamId} onSelectTeam={onSelectTeam} active={pathname === "/" || pathname === ""} />
            {visibleItems(LEFT_HEADER_APPS, isAdmin).map((item) => (
              <HeaderMenuItem key={item.to} label={item.label} active={headerPathIsApp(pathname, item.to)} onClick={() => navigate(item.to)} />
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex min-w-0 shrink-0 items-center">
        {user ? (
          <nav aria-label="Workspace" className="flex items-center">
            {HEADER_NAV_GROUPS.map((group, index) => {
              const items = visibleItems(group.items, isAdmin);
              if (items.length === 0) return null;
              return (
                <div key={group.key} className="flex items-center">
                  {index > 0 ? <HeaderDivider /> : null}
                  <div className="flex items-center gap-1.5">
                    {items.map((item) => (
                      <HeaderIconButton key={item.to} label={item.label} active={pathIsApp(pathname, item.to)} onClick={() => navigate(item.to)}>
                        <FluentIcon name={HEADER_ICONS[item.to]} size={18} />
                      </HeaderIconButton>
                    ))}
                  </div>
                </div>
              );
            })}
            {isAdmin ? (
              <>
                <HeaderDivider />
                <HeaderIconButton label="Settings" active={settingsActive} onClick={() => navigate("/settings/general")}>
                  <FluentIcon name="settings-24" size={18} />
                </HeaderIconButton>
              </>
            ) : null}
          </nav>
        ) : null}

        {user ? (
          <>
            <span className="mx-4 h-5 w-px bg-[rgb(40_32_16/0.16)]" aria-hidden />
            <Tooltip title="Profile" placement="bottom">
              <button type="button" aria-label="Profile" onClick={() => navigate("/profile")} className="inline-flex items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none cursor-pointer hover:opacity-90">
                <span className="inline-flex overflow-hidden rounded-full ring-2 ring-white/90">
                  <UserAvatar avatar={user.avatar} name={displayName} size={26} className="shrink-0 rounded-full" />
                </span>
              </button>
            </Tooltip>
          </>
        ) : null}
      </div>
    </header>
  );
}
