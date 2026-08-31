// ─── App Layout ──────────────────────────────────────────────────────────────
// Shared layout for non-canvas pages: sidebar + content area.

import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-0">
        <Outlet />
      </main>
    </div>
  );
}
