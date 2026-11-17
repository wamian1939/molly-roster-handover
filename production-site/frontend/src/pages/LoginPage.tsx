import { CalendarDays, LockKeyhole, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { MollyBrand, MollyClover } from "../components/brand/MollyBrand";
import { InlineSpinner } from "../components/ui/ToastProvider";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const from = (location.state as { from?: unknown } | null)?.from;
  const target = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/calendar";
  if (user) return <Navigate to={target} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError("");
    try {
      await login(username, password);
      navigate(target, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请重试。");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="login-stage grid min-h-[100dvh] place-items-center px-4 py-8">
      <section className="login-panel w-full max-w-[440px] rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-lift sm:p-8" aria-labelledby="login-title">
        <MollyBrand compact />
        <div className="mt-8 flex items-start gap-4">
          <span className="login-mark grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"><MollyClover size={25} /></span>
          <div><h1 id="login-title" className="text-2xl font-semibold tracking-[-0.025em] text-graphite-950">登录排班工作台</h1><p className="mt-2 text-sm leading-6 text-graphite-600">使用 Evaluate Molly 正式账号，权限和门店范围保持一致。</p></div>
        </div>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-graphite-700">用户名</span><span className="relative block"><UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" /><input className="login-input min-h-11 w-full rounded-xl border border-graphite-200 py-2 pl-10 pr-3 text-sm" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></span></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-graphite-700">密码</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" /><input className="login-input min-h-11 w-full rounded-xl border border-graphite-200 py-2 pl-10 pr-3 text-sm" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></span></label>
          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting} className="login-submit inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-graphite-950 px-4 text-sm font-semibold text-white transition hover:bg-graphite-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <InlineSpinner /> : <CalendarDays className="h-4 w-4" />}{submitting ? "正在登录" : "进入排班系统"}</button>
        </form>
      </section>
    </main>
  );
}

