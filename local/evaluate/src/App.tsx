import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { LoadingState } from "./components/states/LoadingState";
import { LoginPage } from "./pages/LoginPage";
import { BrandLoader } from "./components/brand/BrandLoader";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const EvaluationAnalyticsPage = lazy(() => import("./pages/EvaluationAnalyticsPage").then((module) => ({ default: module.EvaluationAnalyticsPage })));
const RosterSkillBoardPage = lazy(() => import("./pages/RosterSkillBoardPage").then((module) => ({ default: module.RosterSkillBoardPage })));
const StoreEvaluationPage = lazy(() => import("./pages/StoreEvaluationPage").then((module) => ({ default: module.StoreEvaluationPage })));
const StoreEmployeeTypeSelectionPage = lazy(() => import("./pages/StoreEmployeeTypeSelectionPage").then((module) => ({ default: module.StoreEmployeeTypeSelectionPage })));
const EvaluationV1Page = lazy(() => import("./pages/EvaluationV1Page").then((module) => ({ default: module.EvaluationV1Page })));
const EvaluationEntryPage = lazy(() => import("./pages/EvaluationEntryPage").then((module) => ({ default: module.EvaluationEntryPage })));
const LiveEvaluationPage = lazy(() => import("./pages/LiveEvaluationPage").then((module) => ({ default: module.LiveEvaluationPage })));
const EvaluationHistoryIndexPage = lazy(() => import("./pages/EvaluationHistoryIndexPage").then((module) => ({ default: module.EvaluationHistoryIndexPage })));
const EmployeeManagementPage = lazy(() => import("./pages/EmployeeManagementPage").then((module) => ({ default: module.EmployeeManagementPage })));
const EmployeeDetailPage = lazy(() => import("./pages/EmployeeDetailPage").then((module) => ({ default: module.EmployeeDetailPage })));
const StoreManagementPage = lazy(() => import("./pages/StoreManagementPage").then((module) => ({ default: module.StoreManagementPage })));
const AccountManagementPage = lazy(() => import("./pages/AccountManagementPage").then((module) => ({ default: module.AccountManagementPage })));
const EvaluationRoundDetailPage = lazy(() => import("./pages/EvaluationRoundDetailPage").then((module) => ({ default: module.EvaluationRoundDetailPage })));

export default function App() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <BrandLoader />;

  if (!user) {
    return <Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />} /></Routes>;
  }

  return (
    <AppShell>
      <Suspense fallback={<LoadingState label="正在加载页面..." />}>
        <Routes>
          <Route path="/login" element={<Navigate to="/evaluations" replace />} />
          <Route path="/" element={<Navigate to="/evaluations" replace />} />
          <Route path="/evaluations" element={<DashboardPage />} />
          <Route path="/evaluations/stores" element={<DashboardPage />} />
          <Route path="/skill-board" element={<RosterSkillBoardPage />} />
          <Route path="/evaluations/analytics" element={<EvaluationAnalyticsPage />} />
          <Route path="/evaluations/history" element={<EvaluationHistoryIndexPage />} />
          <Route path="/employees" element={<EmployeeManagementPage />} />
          <Route path="/employees/:employeeId" element={<EmployeeDetailPage />} />
          <Route path="/employees/:employeeId/evaluation/v1/new" element={<EvaluationEntryPage />} />
          <Route path="/stores" element={<AdminOnly><StoreManagementPage /></AdminOnly>} />
          <Route path="/accounts" element={<AdminOnly><AccountManagementPage /></AdminOnly>} />
          <Route path="/evaluations/stores/:storeId" element={<StoreScopedRoute><StoreEmployeeTypeSelectionPage /></StoreScopedRoute>} />
          <Route path="/evaluations/stores/:storeId/employees/:employeeType" element={<StoreScopedRoute><StoreEvaluationPage isAdmin={user.role === "ADMIN"} /></StoreScopedRoute>} />
          <Route path="/evaluations/stores/:storeId/employees/:employeeId/evaluation/v1/new" element={<StoreScopedRoute><EvaluationEntryPage /></StoreScopedRoute>} />
          <Route path="/evaluations/v1/:evaluationId" element={<EvaluationV1Page />} />
          <Route path="/evaluation-rounds/:roundId/my-score" element={<LiveEvaluationPage />} />
          <Route path="/evaluation-rounds/:roundId" element={<EvaluationRoundDetailPage />} />
          <Route path="*" element={<Navigate to="/evaluations" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? children : <Navigate to="/evaluations" replace />;
}

function StoreScopedRoute({ children }: { children: ReactNode }) {
  const { user, selectedStoreId } = useAuth();
  const { storeId } = useParams();
  if (user?.canAccessAllStores || (storeId && user?.storeIds.includes(storeId))) return children;
  const fallbackStoreId = selectedStoreId ?? user?.storeIds[0];
  return <Navigate to={fallbackStoreId ? `/evaluations/stores/${encodeURIComponent(fallbackStoreId)}` : "/evaluations"} replace />;
}
