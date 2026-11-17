import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error("UI render failed", { name: error.name, componentStack: info.componentStack }); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="grid min-h-[100dvh] place-items-center bg-graphite-50 p-5"><section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-7 text-center shadow-panel"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-700"><AlertTriangle className="h-6 w-6" /></span><h1 className="mt-4 text-xl font-semibold text-graphite-950">页面暂时无法显示</h1><p className="mt-2 text-sm leading-6 text-graphite-600">请刷新页面重新载入最新排班。如问题持续存在，请联系管理员。</p><button type="button" className="calendar-primary-button mx-auto mt-5" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" />刷新页面</button></section></div>;
  }
}
