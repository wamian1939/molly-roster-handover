import { Bot, CalendarDays, Download, HelpCircle, Layers3, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { MollyBrand } from "../brand/MollyBrand";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/ToastProvider";

const navigation = [
  { label: "排班日历", to: "/calendar", icon: CalendarDays },
  { label: "智能体规则", to: "/agent-rules", icon: Bot },
  { label: "导出", to: "/export", icon: Download },
  { label: "员工与可用时间", to: "/staff", icon: UsersRound },
  { label: "排班模板", to: "/templates", icon: Layers3 },
  { label: "设置", to: "/settings", icon: Settings },
  { label: "帮助", to: "/help", icon: HelpCircle },
] as const;
const mobileNavigation = [navigation[0], navigation[1], navigation[3], navigation[2]] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [location.pathname]);

  return (
    <div className="app-background">
      <div className="app-shell" data-sidebar-collapsed={sidebarCollapsed}>
        <aside className="app-sidebar-panel" aria-label="应用侧边栏">
          <div className="app-sidebar-brand"><MollyBrand /><button type="button" className="app-sidebar-toggle" aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)}>{sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}</button></div>
          <Navigation pathname={location.pathname} />
          <AccountFooter onLogout={signOut} />
        </aside>
        <section className="app-workspace-panel" aria-label="主工作区">
          <div ref={scrollRef} className="app-workspace-scroll">
            <header className="app-mobile-header">
              <MollyBrand compact />
              <button type="button" onClick={() => setDrawerOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-graphite-200 bg-white text-graphite-700 shadow-sm" aria-label="打开导航"><Menu className="h-4 w-4" /></button>
            </header>
            <main className={`app-page-frame${location.pathname.startsWith("/calendar") ? " app-page-frame-calendar" : ""}`}>{children}</main>
          </div>
        </section>
      </div>
      <nav className="app-bottom-navigation" aria-label="移动端导航">
        <div className="grid grid-cols-4 gap-1">{mobileNavigation.map((item) => <NavigationLink key={item.to} item={item} pathname={location.pathname} mobile />)}</div>
      </nav>
      {drawerOpen ? (
        <Dialog titleId="navigation-title" onClose={() => setDrawerOpen(false)} className="app-navigation-drawer">
          <div className="flex items-center justify-between border-b border-graphite-200 px-5 py-5"><div id="navigation-title"><MollyBrand compact /></div><button type="button" onClick={() => setDrawerOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-graphite-100" aria-label="关闭导航"><X className="h-4 w-4" /></button></div>
          <Navigation pathname={location.pathname} onNavigate={() => setDrawerOpen(false)} />
          <AccountFooter onLogout={signOut} />
        </Dialog>
      ) : null}
    </div>
  );

  function signOut() {
    void logout().catch(() => showToast({
      tone: "error",
      title: "退出请求未确认",
      description: "服务器未确认退出；请刷新页面检查登录状态，再次退出。",
    }));
  }

  function AccountFooter({ onLogout }: { onLogout: () => void }) {
    return <div className="app-account-footer"><div className="min-w-0 lg:hidden min-[1360px]:block"><p className="truncate text-sm font-semibold text-graphite-950">{user?.displayName}</p><p className="mt-1 truncate text-xs text-graphite-500">{user?.role === "ADMIN" ? "总账号" : (user?.stores.length ? user.stores.map((store) => store.name).join("、") : undefined) ?? "门店账号"}</p></div><button type="button" onClick={onLogout} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-graphite-200 text-xs font-semibold text-graphite-700 hover:bg-graphite-100" aria-label="退出登录"><LogOut className="h-4 w-4" /><span className="lg:sr-only min-[1360px]:not-sr-only">退出登录</span></button></div>;
  }
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav className="app-sidebar-navigation" aria-label="主导航">{navigation.map((item) => <NavigationLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />)}</nav>;
}

function NavigationLink({ item, pathname, mobile = false, onNavigate }: { item: (typeof navigation)[number]; pathname: string; mobile?: boolean; onNavigate?: () => void }) {
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  return <Link to={item.to} onClick={onNavigate} aria-label={item.label} aria-current={active ? "page" : undefined} className={`${mobile ? "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px]" : "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm lg:justify-center lg:px-0 min-[1360px]:justify-start min-[1360px]:px-3"} font-semibold transition ${active ? "bg-graphite-950 text-white" : "text-graphite-600 hover:bg-graphite-100 hover:text-graphite-950"}`}><item.icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className={!mobile ? "lg:sr-only min-[1360px]:not-sr-only" : "truncate"}>{item.label}</span></Link>;
}

