import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { MollyClover } from "./components/brand/MollyBrand";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";

const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const StaffPage = lazy(() => import("./pages/StaffPage").then((module) => ({ default: module.StaffPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then((module) => ({ default: module.TemplatesPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ExportPage = lazy(() => import("./pages/ExportPage").then((module) => ({ default: module.ExportPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((module) => ({ default: module.HelpPage })));
const AgentRulesPage = lazy(() => import("./pages/AgentRulesPage").then((module) => ({ default: module.AgentRulesPage })));
const EmployeeAvailabilityPage = lazy(() => import("./pages/EmployeeAvailabilityPage").then((module) => ({ default: module.EmployeeAvailabilityPage })));

function ProtectedLayout() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="grid min-h-[100dvh] place-items-center bg-graphite-50" role="status"><div className="flex items-center gap-3 text-sm font-semibold text-graphite-700"><span className="molly-logo-mark grid h-11 w-11 place-items-center rounded-2xl text-white"><MollyClover size={23} /></span>正在确认登录状态</div></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  return <AppShell><Suspense fallback={<div className="grid min-h-72 place-items-center text-sm font-semibold text-graphite-600" role="status">正在加载页面</div>}><Outlet /></Suspense></AppShell>;
}

export default function App() {
  return (
    <Routes>
      {(import.meta.env.DEV || import.meta.env.VITE_EMPLOYEE_PORTAL_MODE === "account") && <Route path="/employee/availability" element={<Suspense fallback={<div role="status">正在加载报班页面…</div>}><EmployeeAvailabilityPage /></Suspense>} />}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/multi-agent" element={<Navigate to="/calendar?agent=1" replace />} />
        <Route path="/agent-rules" element={<AgentRulesPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/calendar" replace />} />
    </Routes>
  );
}
