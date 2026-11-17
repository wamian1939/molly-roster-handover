import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Grid3X3,
  KeyRound,
  LineChart,
  LogOut,
  Menu,
  MoreHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { cx } from "../../lib/format";
import type { AuthUser } from "../../services/authRepository";
import { Dialog } from "../ui/Dialog";
import { MollyLogo } from "../brand/MollyClover";
import { BrandTransitionLayer } from "../brand/BrandTransitionLayer";
import { AppSelect } from "../ui/AppSelect";

const baseNavigation = [
  { label: "评分概览", to: "/evaluations", icon: ClipboardCheck, match: "evaluations" },
  { label: "门店员工", to: "/employees", icon: UsersRound },
  { label: "排班技能板", to: "/skill-board", icon: Grid3X3, match: "skill-board" },
  { label: "评价历史", to: "/evaluations/history", icon: LineChart },
  { label: "数据分析", to: "/evaluations/analytics", icon: BarChart3 },
] as const;

const adminNavigation = [
  { label: "门店管理", to: "/stores", icon: Building2 },
  { label: "账号管理", to: "/accounts", icon: KeyRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, selectedStoreId, selectStore } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = user?.role === "ADMIN" ? [...baseNavigation, ...adminNavigation] : baseNavigation;
  const [moreOpen, setMoreOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const primaryMobileNavigation = baseNavigation.slice(0, 4);
  const moreNavigation = navigation.filter((item) => !primaryMobileNavigation.some((primary) => primary.to === item.to));
  const focusedWorkspace = isFocusedWorkspace(location.pathname);
  const [showLoginTransition] = useState(() => {
    const shouldShow = window.sessionStorage.getItem("molly-login-transition") === "pending";
    if (shouldShow) window.sessionStorage.removeItem("molly-login-transition");
    return shouldShow;
  });

  useEffect(() => {
    if (workspaceScrollRef.current) workspaceScrollRef.current.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    const routeStoreId = location.pathname.match(/^\/evaluations\/stores\/([^/]+)/)?.[1];
    if (routeStoreId && user?.storeIds.includes(decodeURIComponent(routeStoreId))) selectStore(decodeURIComponent(routeStoreId));
  }, [location.pathname, selectStore, user?.storeIds]);

  return (
    <div className="app-background">
      <div className="app-shell">
        <aside className="app-sidebar-panel" aria-label="应用侧边栏">
          <div className="app-sidebar-brand">
            <Brand />
          </div>
          <StoreContextControl user={user} selectedStoreId={selectedStoreId} onSelect={(storeId) => changeStoreContext(storeId, user, location.pathname, location.search, selectStore, navigate)} />
          <SidebarContent navigation={navigation} pathname={location.pathname} />
          <AccountFooter user={user} onLogout={() => void logout()} />
        </aside>

        <section className="app-workspace-panel" aria-label="主工作区">
          <div ref={workspaceScrollRef} className="app-workspace-scroll">
            <header className="app-mobile-header">
              <Brand compact />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNavigationOpen(true)}
                  aria-label="打开导航"
                  aria-haspopup="dialog"
                  className="hidden h-11 w-11 items-center justify-center rounded-xl border border-graphite-200 bg-white text-graphite-700 shadow-sm transition hover:border-graphite-300 hover:bg-graphite-50 md:inline-flex lg:hidden"
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  title="退出登录"
                  aria-label="退出登录"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-graphite-200 bg-white text-graphite-700 shadow-sm transition hover:border-graphite-300 hover:bg-graphite-50 md:hidden"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>
            <main className={cx("app-page-frame", focusedWorkspace && "app-page-frame-focus")}>{children}</main>
          </div>
        </section>
      </div>

      <nav className="app-bottom-navigation" aria-label="移动端导航">
        <div className="grid grid-cols-5 gap-1">
          {primaryMobileNavigation.map((item) => (
            <NavigationLink key={item.label} item={item} pathname={location.pathname} mobile />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold text-graphite-600 transition hover:bg-graphite-100 hover:text-graphite-950"
            aria-haspopup="dialog"
            aria-label="打开更多菜单"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            <span>更多</span>
          </button>
        </div>
      </nav>

      {navigationOpen ? (
        <Dialog titleId="tablet-navigation-title" onClose={() => setNavigationOpen(false)} className="app-navigation-drawer">
          <div className="flex items-center justify-between gap-3 border-b border-graphite-200 px-5 py-5">
            <div id="tablet-navigation-title"><Brand /></div>
            <button type="button" onClick={() => setNavigationOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-graphite-100 text-graphite-700 transition hover:bg-graphite-200" aria-label="关闭导航">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <StoreContextControl user={user} selectedStoreId={selectedStoreId} onSelect={(storeId) => { changeStoreContext(storeId, user, location.pathname, location.search, selectStore, navigate); setNavigationOpen(false); }} />
          <SidebarContent navigation={navigation} pathname={location.pathname} onNavigate={() => setNavigationOpen(false)} />
          <AccountFooter user={user} onLogout={() => void logout()} />
        </Dialog>
      ) : null}

      {moreOpen ? (
        <Dialog titleId="mobile-more-title" onClose={() => setMoreOpen(false)} className="app-more-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mobile-more-title" className="text-lg font-semibold text-graphite-950">更多功能</h2>
            <button type="button" onClick={() => setMoreOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-graphite-100 text-graphite-700 transition hover:bg-graphite-200" aria-label="关闭更多菜单">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <nav className="mt-4 grid gap-2" aria-label="更多功能">
            {moreNavigation.map((item) => (
              <NavigationLink key={item.label} item={item} pathname={location.pathname} onNavigate={() => setMoreOpen(false)} />
            ))}
          </nav>
          <button type="button" onClick={() => void logout()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-graphite-200 text-sm font-semibold text-graphite-700 transition hover:bg-graphite-100">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            退出登录
          </button>
        </Dialog>
      ) : null}
      {showLoginTransition ? <BrandTransitionLayer mode="success" /> : null}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <MollyLogo compact={compact} />;
}

function SidebarContent({ navigation, pathname, onNavigate }: { navigation: readonly NavigationItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="app-sidebar-navigation" aria-label="主导航">
      {navigation.map((item) => (
        <NavigationLink key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function AccountFooter({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  return (
    <div className="app-account-footer">
      <div className="min-w-0 lg:hidden min-[1360px]:block">
        <p className="truncate text-sm font-semibold text-graphite-950">{user?.displayName}</p>
        <p className="mt-1 truncate text-xs text-graphite-500">{user?.role === "ADMIN" ? "总管理员" : user?.stores.length === 1 ? user.stores[0]?.name : `${user?.stores.length ?? 0} 家门店`}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-graphite-200 text-xs font-semibold text-graphite-700 transition hover:border-graphite-300 hover:bg-graphite-100"
        aria-label="退出登录"
        title="退出登录"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className="lg:sr-only min-[1360px]:not-sr-only">退出登录</span>
      </button>
    </div>
  );
}

function StoreContextControl({ user, selectedStoreId, onSelect }: { user: AuthUser | null; selectedStoreId: string | null; onSelect: (storeId: string) => void }) {
  if (!user || user.role === "ADMIN") return null;
  if (user.stores.length <= 1) {
    return <div className="mx-3 mb-2 rounded-lg bg-graphite-50 px-3 py-2.5 lg:mx-2 min-[1360px]:mx-3"><p className="text-[11px] font-semibold text-graphite-500 lg:sr-only min-[1360px]:not-sr-only">当前门店</p><p className="mt-0.5 truncate text-sm font-semibold text-graphite-900 lg:text-center min-[1360px]:text-left">{user.stores[0]?.name ?? "暂无可用门店"}</p></div>;
  }
  const value = selectedStoreId ?? user.stores[0]?.id ?? "";
  const options = user.stores.map((store) => ({ value: store.id, label: store.name }));
  return <div className="mx-3 mb-2 lg:mx-2 min-[1360px]:mx-3"><div className="lg:hidden min-[1360px]:block"><AppSelect label="当前门店" size="compact" value={value} onValueChange={onSelect} options={options} /></div><div className="app-store-context-compact hidden lg:block min-[1360px]:hidden" title={user.stores.find((store) => store.id === value)?.name}><AppSelect ariaLabel="切换当前门店" size="compact" value={value} onValueChange={onSelect} icon={<Building2 className="h-4 w-4" />} options={options} /></div></div>;
}

function changeStoreContext(
  storeId: string,
  user: AuthUser | null,
  pathname: string,
  search: string,
  selectStore: (storeId: string) => void,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (!user?.storeIds.includes(storeId)) return;
  selectStore(storeId);
  const storeRoute = pathname.match(/^\/evaluations\/stores\/([^/]+)(.*)$/);
  if (storeRoute) {
    navigate(`/evaluations/stores/${encodeURIComponent(storeId)}${storeRoute[2] ?? ""}`);
    return;
  }
  if (pathname === "/skill-board") {
    const params = new URLSearchParams(search);
    params.set("storeId", storeId);
    navigate(`/skill-board?${params.toString()}`);
  }
}

type NavigationItem = (typeof baseNavigation)[number] | (typeof adminNavigation)[number];

function NavigationLink({ item, pathname, mobile = false, onNavigate }: { item: NavigationItem; pathname: string; mobile?: boolean; onNavigate?: () => void }) {
  const active = isNavigationActive(item, pathname);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={!mobile ? item.label : undefined}
      className={cx(
        "relative isolate overflow-hidden transition",
        mobile
          ? "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold"
          : "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium lg:justify-center lg:px-0 min-[1360px]:justify-start min-[1360px]:px-3",
        active ? "text-white" : "text-graphite-600 hover:bg-graphite-100 hover:text-graphite-950",
      )}
    >
      {active ? <span className="nav-active-indicator absolute inset-0 -z-[1] rounded-xl bg-graphite-950 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" /> : null}
      <span className={cx("shrink-0", active && "nav-active-icon")}><item.icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className={cx("relative", !mobile && "lg:sr-only min-[1360px]:not-sr-only")}>{item.label}</span>
    </Link>
  );
}

function isNavigationActive(item: NavigationItem, pathname: string) {
  if ("match" in item && item.match === "skill-board") return pathname.startsWith("/skill-board");
  if ("match" in item && item.match === "evaluations") {
    return pathname === "/evaluations" || pathname === "/evaluations/stores" || pathname.startsWith("/evaluations/stores/") || pathname.startsWith("/evaluations/v1/");
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function isFocusedWorkspace(pathname: string) {
  return pathname.startsWith("/evaluations/v1/") || /^\/employees\/[^/]+$/.test(pathname);
}
