import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch } from "src/store/store";

import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import type { SettingsTab } from "./common/constants";
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
    <PageShell>
      <RenderIf condition={activeTab !== "providers"}>
        <div className="mb-6">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">{TAB_TITLES[activeTab]}</h1>
        </div>
      </RenderIf>
      <ActiveComponent />
    </PageShell>
  );
}
