export type DesktopApp = {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
};

/** Tools & Skills — left header. */
export const LEFT_HEADER_APPS: DesktopApp[] = [
  { to: "/tools", label: "Tools", icon: "Tool" },
  { to: "/skills", label: "Skills", icon: "Sparkles" },
];

export type HeaderNavGroup = {
  key: "sites" | "data";
  items: DesktopApp[];
};

export const HEADER_NAV_GROUPS: HeaderNavGroup[] = [
  {
    key: "sites",
    items: [
      { to: "/sites", label: "Sites", icon: "Monitor" },
      { to: "/jobs", label: "Jobs", icon: "Clock", adminOnly: true },
      { to: "/my-mcp-servers", label: "MCP Servers", icon: "Globe" },
    ],
  },
  {
    key: "data",
    items: [
      { to: "/datatables", label: "Datatables", icon: "Database" },
      { to: "/kvstore", label: "KV Store", icon: "Key" },
      { to: "/secrets", label: "Secrets", icon: "Lock", adminOnly: true },
    ],
  },
];

export const HEADER_APPS: DesktopApp[] = [...LEFT_HEADER_APPS, ...HEADER_NAV_GROUPS.flatMap((group) => group.items)];

export const DESKTOP_APPS: DesktopApp[] = HEADER_APPS;

export const SETTINGS_APP: DesktopApp = { to: "/settings/general", label: "Settings", icon: "Settings", adminOnly: true };

export const DESKTOP_HOME = "/";

/** Fluent Color icons for header buttons. */
export const HEADER_APP_ICONS: Record<string, string> = {
  "/tools": "toolbox-24",
  "/skills": "design-ideas-24",
  "/sites": "content-view-24",
  "/jobs": "shifts-24",
  "/my-mcp-servers": "puzzle-piece-24",
  "/datatables": "database-24",
  "/kvstore": "notebook-24",
  "/secrets": "vault-24",
  "/settings/general": "settings-24",
};

export function isDesktopHome(pathname: string) {
  return pathname === "/" || pathname === "" || pathname === "/agents";
}

const WINDOW_META: { prefix: string; title: string; icon: string }[] = [
  { prefix: "/settings", title: "Settings", icon: HEADER_APP_ICONS["/settings/general"] ?? "settings-24" },
  { prefix: "/profile", title: "Profile", icon: "person-24" },
  ...DESKTOP_APPS.map((app) => ({ prefix: app.to, title: app.label, icon: HEADER_APP_ICONS[app.to] ?? "apps-24" })),
];

export function pathIsApp(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function agentIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "agents" || !parts[1]) return null;
  return parts[1];
}

export function skillIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "skills" || !parts[1]) return null;
  return parts[1];
}

export function siteIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "sites" || !parts[1]) return null;
  return parts[1];
}

/** Project detail (`/datatables/:id`), not list. */
export function datatableProjectDetailFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "datatables" || !parts[1]) return null;
  return parts[1];
}

export function toolIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "tools" || !parts[1]) return null;
  return parts[1];
}

export function jobIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "jobs" || !parts[1]) return null;
  return parts[1];
}

export function pathIsAgent(pathname: string, id: string) {
  return pathname === `/agents/${id}` || pathname.startsWith(`/agents/${id}/`);
}

/** Fluent icon name for the desktop window title bar. */
export function windowMeta(pathname: string, _agentName?: string | null): { title?: string; icon: string } | null {
  if (isDesktopHome(pathname)) return null;
  if (agentIdFromPath(pathname)) return { icon: "bot-24" };
  if (skillIdFromPath(pathname)) return { icon: HEADER_APP_ICONS["/skills"] ?? "design-ideas-24" };
  if (siteIdFromPath(pathname)) return { icon: HEADER_APP_ICONS["/sites"] ?? "content-view-24" };
  if (toolIdFromPath(pathname)) return { icon: HEADER_APP_ICONS["/tools"] ?? "toolbox-24" };
  if (jobIdFromPath(pathname)) return { icon: HEADER_APP_ICONS["/jobs"] ?? "shifts-24" };
  if (datatableProjectDetailFromPath(pathname)) return { icon: HEADER_APP_ICONS["/datatables"] ?? "database-24" };
  const hit = WINDOW_META.find((item) => pathIsApp(pathname, item.prefix));
  return hit ? { title: hit.title, icon: hit.icon } : { title: "Window", icon: "apps-24" };
}

export function windowKey(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}
