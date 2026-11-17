import { useEffect, useState } from "react";
import { ChevronRight, LogOut, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { MollyBrand } from "../components/brand/MollyBrand";
import { EmployeeWeekForm } from "../components/employee/EmployeeWeekForm";
import { employeePortalRepository, EmployeePortalError, type EmployeeAccount, type EmployeePortalClient } from "../services/employeePortalRepository";
import "./employeeAvailability.css";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "请求失败，请稍后重试";

export function EmployeeAvailabilityPage({ portal = employeePortalRepository }: { portal?: EmployeePortalClient }) {
  const [query] = useSearchParams();
  const demo = portal.mode === "demo";
  // Personal demo links are selection hints only, never an authenticated identity.
  const requestedAccount = demo ? query.get("account") : null;
  return <EmployeePortalSession key={`${portal.mode}:${requestedAccount ?? "session"}`} portal={portal} requestedAccount={requestedAccount} />;
}

function EmployeePortalSession({ portal, requestedAccount }: { portal: EmployeePortalClient; requestedAccount: string | null }) {
  const demo = portal.mode === "demo";
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [account, setAccount] = useState<EmployeeAccount | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const { account: current } = await portal.me();
        if (active && (!requestedAccount || requestedAccount === current.id)) setAccount(current);
      } catch (cause) {
        if (active && (!(cause instanceof EmployeePortalError) || cause.status !== 401)) setError(message(cause));
      }
      if (demo) {
        try { const result = await portal.accounts(); if (active) setAccounts(result.accounts); }
        catch (cause) { if (active) setError(message(cause)); }
      }
      if (active) setChecking(false);
    }
    void restore();
    return () => { active = false; };
  }, [portal, requestedAccount, demo, reload]);
  async function login(id: string) {
    setBusy(true); setError("");
    try { setAccount((await portal.login(id)).account); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function logout() {
    if (hasDraft && !window.confirm("放弃尚未提交的修改并退出账号？")) return;
    setBusy(true); setError("");
    try { await portal.logout(); setAccount(null); setHasDraft(false); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <div className="employee-portal">
    {demo && <div className="employee-demo-notice">体验模式 · 使用演示账号，填写内容不会进入正式排班</div>}
    <div className="employee-container">
      <header className="employee-header"><MollyBrand compact />{account && <button className="employee-text-button" disabled={busy} onClick={() => void logout()}><LogOut size={16} />退出账号</button>}</header>
      {error && <div role="alert" className="employee-error">{error}<button className="employee-text-button" disabled={checking || busy} onClick={() => { setChecking(true); setError(""); setReload(n => n + 1); }}><RefreshCw size={16} />重新连接</button></div>}
      {checking ? <p role="status" className="employee-loading">正在确认员工身份…</p> : !account ? <main className="employee-login">
        <p className="employee-eyebrow">员工报班</p><h1>{demo ? "安排下一周的可用时间" : "请先登录员工账号"}</h1>
        <p>{demo ? "选择演示账号，填写每一天可以工作的时间。" : "请使用你本人的员工账号。登录后即可查看和提交个人可用时间。"}</p>
        {demo ? <><div className="employee-accounts">{accounts.filter(a => !requestedAccount || a.id === requestedAccount).map(a => <button disabled={busy} key={a.id} onClick={() => void login(a.id)}><span className="employee-avatar">{a.name.slice(-1)}</span><span><strong>{a.name}</strong><small>{a.storeName}</small></span><ChevronRight size={20} /></button>)}</div>
          {requestedAccount && !error && !accounts.some(a => a.id === requestedAccount) && <p role="alert">这个演示账号链接无效，请使用负责人提供的链接。</p>}
          {!requestedAccount && !error && accounts.length === 0 && <p role="status">暂无可用演示账号，请联系门店负责人。</p>}
          <p className="employee-footnote">演示账号无需密码，仅用于体验个人报班。</p></> : portal.signInPath ? <a className="employee-primary employee-signin" href={portal.signInPath}>登录员工账号<ChevronRight size={18} /></a> : <p className="employee-footnote">请从门店提供的员工入口登录。</p>}
      </main> : <EmployeeWeekForm key={account.id} account={account} api={portal} onDirtyChange={setHasDraft} onBusyChange={setBusy} />}
    </div>
  </div>;
}
