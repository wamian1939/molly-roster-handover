import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BrandTransitionLayer } from "../components/brand/BrandTransitionLayer";
import { MollyClover } from "../components/brand/MollyClover";
import { cx } from "../lib/format";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/evaluations" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    window.sessionStorage.setItem("molly-login-transition", "pending");
    try {
      await login(username, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/evaluations", { replace: true });
    } catch (reason) {
      window.sessionStorage.removeItem("molly-login-transition");
      setError(reason instanceof Error ? reason.message : "用户名或密码错误");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-stage relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="login-brand-glow pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="login-brand-orb pointer-events-none absolute left-1/2 top-[-18rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full blur-3xl" />
      <section
        className={cx("login-panel relative w-full max-w-sm overflow-hidden rounded-2xl bg-white/95 p-7 shadow-[0_24px_80px_rgba(17,23,34,.14)] backdrop-blur", isSubmitting && "login-panel-submitting")}
        aria-labelledby="login-title"
        aria-busy={isSubmitting}
      >
        <div aria-hidden="true" className="login-card-accent absolute inset-x-0 top-0 h-px" />
        <div className="login-mark flex h-11 w-11 items-center justify-center rounded-xl text-white">
          <MollyClover size={23} tone="white" />
        </div>
        <h1 id="login-title" className="mt-6 text-2xl font-semibold text-graphite-950">员工评价系统</h1>
        <p className="mt-2 text-sm text-graphite-500">使用公司分配的账号登录</p>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-graphite-700">
            用户名
            <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="login-input mt-1.5 h-11 w-full rounded-lg border border-graphite-300 px-3 text-graphite-950" required />
          </label>
          <label className="block text-sm font-medium text-graphite-700">
            密码
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="login-input mt-1.5 h-11 w-full rounded-lg border border-graphite-300 px-3 text-graphite-950" required />
          </label>
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={isSubmitting} className="login-submit h-11 w-full rounded-lg bg-graphite-950 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-graphite-800 active:scale-[0.98] disabled:opacity-60">
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>
      </section>
      <BrandTransitionLayer mode="intro" />
    </main>
  );
}
