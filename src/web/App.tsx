import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getAuthToken } from "./common/api";
import { fetchCurrentUser } from "./common/authSlice";
import { useSocket } from "./common/hooks/useSocket";
import { AppLayout } from "./components/AppLayout";

import { useAppDispatch, useAppSelector } from "./store/store";
import "./index.css";

const ToolsPage = lazy(() => import("./modules/tools/ToolsPage"));
const SkillsPage = lazy(() => import("./modules/skills/SkillsPage"));
const SettingsPage = lazy(() => import("./modules/settings/SettingsPage"));
const AgentsPage = lazy(() => import("./modules/agents/AgentsPage"));
const PublicChatPage = lazy(() => import("./modules/agents/public/PublicChatPage"));
const LoginPage = lazy(() => import("./modules/auth/LoginPage"));
const SetupPage = lazy(() => import("./modules/auth/SetupPage"));
const EditToolPage = lazy(() => import("./modules/tools/[id]/EditToolPage"));
const EditSkillPage = lazy(() => import("./modules/skills/[id]/EditSkillPage"));
const AgentDetailPage = lazy(() => import("./modules/agents/[id]/page"));
const DashboardPage = lazy(() => import("./modules/dashboard/DashboardPage"));
const ProfilePage = lazy(() => import("./modules/profile/ProfilePage"));
const McpServersPage = lazy(() => import("./modules/mcp-servers/McpServersPage"));
const KvStorePage = lazy(() => import("./modules/kvstore/KvStorePage"));
const SecretsPage = lazy(() => import("./modules/secrets/SecretsPage"));
const DatatablesPage = lazy(() => import("./modules/datatables/DatatablesPage"));
const DatatableProjectPage = lazy(() => import("./modules/datatables/DatatableProjectPage"));
const DatatableSchemaEditorPage = lazy(() => import("./modules/datatables/DatatableSchemaEditorPage"));
const SitesPage = lazy(() => import("./modules/sites/SitesPage"));
const SiteEditorPage = lazy(() => import("./modules/sites/[id]/SiteEditorPage"));
const JobsPage = lazy(() => import("./modules/jobs/JobsPage"));
const JobEditPage = lazy(() => import("./modules/jobs/[id]/JobEditPage"));
const NotFoundPage = lazy(() => import("./modules/not-found/NotFoundPage"));
const NonlaUiDemoPage = lazy(() => import("./modules/dev/NonlaUiDemoPage"));

// ── Public routes (no sidebar, no auth) ─────────────────────────────────────
const PUBLIC_ROUTE_PREFIXES = ["/chat", "/dev/nonla-ui"];

// ── Auth guard ──────────────────────────────────────────────────────────────
function AuthGuard() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate("/login", { replace: true });
    } else {
      dispatch(fetchCurrentUser());
    }
    // Only run once on mount — no need to re-fetch on every route change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!getAuthToken()) return null;
  return <Outlet />;
}

// ── Admin guard — redirects non-admin users to dashboard ────────────────────
function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const loaded = useAppSelector((s) => s.auth.loaded);

  // Still loading user info — render nothing to avoid flash
  if (!loaded) return null;

  // Not admin → redirect to dashboard
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ── Main content ─────────────────────────────────────────────────────────────

function AppContent() {
  const location = useLocation();

  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const isLoginRoute = location.pathname === "/login";
  const isSetupRoute = location.pathname === "/setup";
  const isAuthRoute = isLoginRoute || isSetupRoute;

  useSocket(!isAuthRoute && !isPublicRoute);

  // Login/Setup routes → full-width, no auth
  if (isAuthRoute) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </Suspense>
    );
  }

  // Public routes → full-width, no sidebar
  if (isPublicRoute) {
    return (
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/chat/:id" element={<PublicChatPage />} />
              <Route path="/dev/nonla-ui" element={<NonlaUiDemoPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  // App routes — protected pages under AuthGuard; unknown paths → 404
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<AuthGuard />}>
          {/* Full-page routes (no sidebar) */}
          <Route path="/tools/:id" element={<EditToolPage />} />
          <Route path="/skills/:id" element={<EditSkillPage />} />
          <Route path="/sites/:id" element={<SiteEditorPage />} />
          <Route path="/agents/:id/*" element={<AgentDetailPage />} />
          <Route
            path="/jobs/:id"
            element={
              <AdminGuard>
                <JobEditPage />
              </AdminGuard>
            }
          />

          {/* Sidebar pages — wrapped in AppLayout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/mcp-servers" element={<McpServersPage />} />
            <Route path="/teams" element={<Navigate to="/agents" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/providers" element={<Navigate to="/settings/providers" replace />} />
            <Route path="/kvstore" element={<KvStorePage />} />
            <Route path="/datatables" element={<DatatablesPage />} />
            <Route path="/datatables/:projectId/editor" element={<DatatableSchemaEditorPage />} />
            <Route path="/datatables/:projectId" element={<DatatableProjectPage />} />
            <Route
              path="/secrets"
              element={
                <AdminGuard>
                  <SecretsPage />
                </AdminGuard>
              }
            />
            <Route
              path="/jobs"
              element={
                <AdminGuard>
                  <JobsPage />
                </AdminGuard>
              }
            />
            <Route
              path="/settings/*"
              element={
                <AdminGuard>
                  <SettingsPage />
                </AdminGuard>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
