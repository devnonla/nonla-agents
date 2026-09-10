import { useEffect } from "react";
import { NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch } from "src/store/store";

import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import type { SettingsTab } from "./common/constants";
import { SETTINGS_TABS } from "./common/constants";
import { DefaultModelsPage } from "./default-models/DefaultModelsPage";
import { GeneralPage } from "./general/GeneralPage";
import { ProvidersPage } from "./providers/ProvidersPage";
import { UsersPage } from "./users/UsersPage";

const TAB_COMPONENTS: Record<SettingsTab, React.ComponentType> = {
  general: GeneralPage,
  "default-models": DefaultModelsPage,
  providers: ProvidersPage,
  "api-keys": ApiKeysPage,
  users: UsersPage,
};

const TAB_TITLES: Record<SettingsTab, string> = {
  general: "General",
  "default-models": "Default models",
  providers: "LLM Providers",
  "api-keys": "API Keys",
  users: "Users",
};

function useActiveTab(): SettingsTab | null {
  const { pathname } = useLocation();
  const segment = pathname.split("/").filter(Boolean)[1];
  if (segment === "general" || segment === "default-models" || segment === "providers" || segment === "api-keys" || segment === "users") {
    return segment;
  }
  return null;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const activeTab = useActiveTab();

  useEffect(() => {
    if (pathname === "/settings" || pathname === "/settings/") {
      navigate("/settings/general", { replace: true });
    }
  }, [pathname, navigate]);

  useEffect(() => {
    if (activeTab === "providers") {
      void dispatch(fetchLlmProviders());
    }
  }, [activeTab, dispatch]);

  if (!activeTab) {
    return <Navigate to="/settings/general" replace />;
  }

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <PageShell className="h-full min-h-0 overflow-hidden pt-0 pb-0 px-0" contentClassName="max-w-none h-full min-h-0">
      <div className="flex h-full min-h-0">
        <aside className="h-full w-56 shrink-0 overflow-y-auto overscroll-contain border-r border-white/30 bg-white/20">
          <div className="px-4 pb-3 pt-5">
            <h1 className="m-0 text-base font-semibold leading-tight text-foreground">Settings</h1>
            <p className="mt-1 mb-0 text-[12px] leading-snug text-muted-foreground">Timezone, models, and access.</p>
          </div>
          <nav aria-label="Settings" className="flex flex-col gap-0.5 px-2 pb-4">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink key={tab.key} to={`/settings/${tab.key}`} className={({ isActive }) => cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium no-underline transition-colors", isActive ? "bg-white/70 text-foreground" : "text-muted-foreground hover:bg-white/40 hover:text-foreground")}>
                  <Icon size={16} weight="BoldDuotone" className="shrink-0" />
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-5">
          <RenderIf condition={activeTab !== "providers"}>
            <div className="mb-5">
              <h2 className="m-0 text-lg font-semibold leading-tight text-foreground">{TAB_TITLES[activeTab]}</h2>
            </div>
          </RenderIf>
          <ActiveComponent />
        </section>
      </div>
    </PageShell>
  );
}
