export type DesktopApp = {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
};

export const LEFT_HEADER_APPS: DesktopApp[] = [
  { to: "/tools", label: "Tools", icon: "Tool" },
  { to: "/skills", label: "Skills", icon: "Sparkles" },
  { to: "/mcp-servers", label: "Connect MCP", icon: "Plug" },
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

const WINDOW_META: { prefix: string; title: string; icon: string }[] = [{ prefix: "/settings", title: "Settings", icon: "Settings" }, { prefix: "/profile", title: "Profile", icon: "User" }, ...DESKTOP_APPS.map((app) => ({ prefix: app.to, title: app.label, icon: app.icon }))];

export function pathIsApp(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function headerPathIsApp(pathname: string, to: string) {
  if (to === "/agents") return pathname === "/agents";
  return pathIsApp(pathname, to);
}

export function agentIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "agents" || !parts[1]) return null;
  return parts[1];
}

export function pathIsAgent(pathname: string, id: string) {
  return pathname === `/agents/${id}` || pathname.startsWith(`/agents/${id}/`);
}

export function windowMeta(pathname: string, agentName?: string | null): { title: string; icon: string } | null {
  if (pathname === "/" || pathname === "") return null;
  if (agentIdFromPath(pathname)) return { title: agentName || "Agent", icon: "Robot" };
  const hit = WINDOW_META.find((item) => pathIsApp(pathname, item.prefix));
  return hit ? { title: hit.title, icon: hit.icon } : { title: "Window", icon: "Sparkles" };
}

export function windowKey(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}
