import { Sidebar, type SidebarItemType } from "devnonla-ui";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
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

const SIDEBAR_ITEMS: SidebarItemType[] = SETTINGS_TABS.map((tab) => ({
  key: tab.key,
  label: tab.label,
  icon: tab.icon,
}));

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
        <Sidebar
          aria-label="Settings"
          className="w-56 shrink-0 border-r border-white/30 bg-white/20"
          header={
            <div className="px-4 pb-3 pt-5">
              <h1 className="m-0 text-base font-semibold leading-tight text-foreground">Settings</h1>
              <p className="mt-1 mb-0 text-[12px] leading-snug text-muted-foreground">Timezone, models, and access.</p>
            </div>
          }
          items={SIDEBAR_ITEMS}
          selectedKey={activeTab}
          onSelect={({ key }) => navigate(`/settings/${key}`)}
        />

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
