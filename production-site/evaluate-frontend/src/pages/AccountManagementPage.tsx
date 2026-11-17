import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { PageContainer } from "../components/layout/PageContainer";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { Dialog } from "../components/ui/Dialog";
import { AppSelect } from "../components/ui/AppSelect";
import { StoreMultiSelect } from "../components/ui/StoreMultiSelect";
import { InlineSpinner, useToast } from "../components/ui/ToastProvider";
import { authRepository, type AccountRole, type ManagedAccount } from "../services/authRepository";
import { evaluationRepository } from "../services/evaluationRepository";
import type { Store } from "../types/evaluation";

const blankForm = { username: "", displayName: "", password: "", role: "STORE_EVALUATOR" as AccountRole, storeIds: [] as string[] };

export function AccountManagementPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState("all");
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const mounted = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setError(null);
    try {
      const [accountRows, storeRows] = await Promise.all([
        authRepository.listAccounts(storeFilter === "all" ? undefined : storeFilter),
        evaluationRepository.fetchStores(),
      ]);
      if (mounted.current && sequence === loadSequence.current) {
        setAccounts(accountRows);
        setStores(storeRows);
      }
    } catch (reason) {
      if (mounted.current && sequence === loadSequence.current) setError(reason instanceof Error ? reason.message : "无法加载账号，请稍后重试。");
    } finally {
      if (mounted.current && sequence === loadSequence.current) setIsLoading(false);
    }
  }, [storeFilter]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.role === "STORE_EVALUATOR" && form.storeIds.length === 0) {
      setStoreError("请至少选择一家可管理门店");
      return;
    }
    setIsSaving(true);
    setError(null);
    setStoreError(null);
    try {
      if (editingId) {
        await authRepository.updateAccount(editingId, { displayName: form.displayName, role: form.role, storeIds: form.role === "ADMIN" ? [] : form.storeIds });
        showToast({ tone: "success", title: "账号权限已更新", description: "新的门店权限将在该账号下一次请求时生效。" });
      } else {
        await authRepository.createAccount({ ...form, storeIds: form.role === "ADMIN" ? [] : form.storeIds });
        showToast({ tone: "success", title: "账号已创建" });
      }
      resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法保存账号，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  function edit(account: ManagedAccount) {
    setEditingId(account.id);
    setStoreError(null);
    setForm({ username: account.username, displayName: account.displayName, password: "", role: account.role, storeIds: account.stores.map((store) => store.id) });
  }

  function resetForm() {
    setForm(blankForm);
    setEditingId(null);
    setStoreError(null);
  }

  async function toggle(account: ManagedAccount) {
    setError(null);
    try {
      await authRepository.updateAccount(account.id, { isActive: !account.isActive });
      showToast({ tone: "success", title: account.isActive ? "账号已停用" : "账号已启用" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法更新账号状态。");
    }
  }

  if (isLoading) return <LoadingState label="正在加载账号..." />;

  return (
    <PageContainer>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-medium text-signal-teal">系统管理</p><h1 className="mt-2 text-3xl font-semibold text-graphite-950 sm:text-4xl">账号管理</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-600">门店评分账号可同时管理多家门店；总管理员自动拥有全部门店权限。</p></div>
        <AppSelect label="按门店筛选" size="compact" className="w-full sm:w-64" value={storeFilter} onValueChange={setStoreFilter} options={[{ value: "all", label: "全部门店" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]} />
      </header>
      {error ? <ErrorState title="账号操作暂不可用" description={error} /> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-xl border border-graphite-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-graphite-200 px-5 py-4"><h2 className="font-semibold text-graphite-950">账号列表</h2><span className="text-xs font-semibold tabular-nums text-graphite-500">{accounts.length} 个账号</span></div>
          {accounts.length ? (
            <>
            <div className="divide-y divide-graphite-100 md:hidden">{accounts.map((account) => (
              <article key={account.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-graphite-950">{account.username}</p><p className="mt-0.5 truncate text-xs text-graphite-500">{account.displayName}</p></div><span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${account.isActive ? "bg-emerald-50 text-emerald-800" : "bg-graphite-100 text-graphite-600"}`}>{account.isActive ? "启用" : "停用"}</span></div>
                <dl className="grid gap-2 text-sm"><div><dt className="text-xs text-graphite-500">角色</dt><dd className="mt-1 font-medium text-graphite-800">{roleLabel(account.role)}</dd></div><div><dt className="text-xs text-graphite-500">可管理门店</dt><dd className="mt-1"><AccountStores account={account} /></dd></div><div><dt className="text-xs text-graphite-500">最后登录</dt><dd className="mt-1 text-xs text-graphite-600">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}</dd></div></dl>
                <AccountActions account={account} currentAccountId={user?.id} onEdit={() => edit(account)} onReset={() => setResetTarget(account)} onToggle={() => void toggle(account)} onDelete={() => setDeleteTarget(account)} />
              </article>
            ))}</div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[840px] table-fixed text-left text-sm"><thead className="bg-graphite-50 text-xs text-graphite-500"><tr><th className="w-[19%] px-3 py-3">账号</th><th className="w-[14%] px-3 py-3">角色</th><th className="w-[20%] px-3 py-3">可管理门店</th><th className="w-[9%] px-3 py-3">状态</th><th className="w-[18%] px-3 py-3">最后登录</th><th className="w-[20%] px-3 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-graphite-100">{accounts.map((account) => (
              <tr key={account.id} className="align-middle hover:bg-graphite-50/70">
                <td className="px-3 py-3"><p className="truncate font-semibold text-graphite-950" title={account.username}>{account.username}</p><p className="mt-0.5 truncate text-xs text-graphite-500" title={account.displayName}>{account.displayName}</p></td>
                <td className="px-3 py-3 leading-5">{roleLabel(account.role)}</td>
                <td className="px-3 py-3"><AccountStores account={account} /></td>
                <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${account.isActive ? "bg-emerald-50 text-emerald-800" : "bg-graphite-100 text-graphite-600"}`}>{account.isActive ? "启用" : "停用"}</span></td>
                <td className="px-3 py-3 text-xs leading-5 text-graphite-500">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}</td>
                <td className="px-3 py-3"><AccountActions account={account} currentAccountId={user?.id} onEdit={() => edit(account)} onReset={() => setResetTarget(account)} onToggle={() => void toggle(account)} onDelete={() => setDeleteTarget(account)} /></td>
              </tr>
            ))}</tbody></table></div>
            </>
          ) : <EmptyState title="暂无匹配账号" description="调整门店筛选，或创建新的门店评分账号。" />}
        </section>

        <form onSubmit={submit} autoComplete="off" className="h-fit rounded-xl border border-graphite-200 bg-white p-5">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" /><h2 className="font-semibold text-graphite-950">{editingId ? "修改账号" : "创建账号"}</h2></div>
          <div className="mt-5 space-y-4">
            <Field label="用户名" value={form.username} onChange={(value) => setForm({ ...form, username: value })} disabled={Boolean(editingId)} />
            <Field label="显示名称" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} />
            {!editingId ? <Field label="初始密码" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} /> : null}
            <AppSelect label="角色" value={form.role} onValueChange={(role) => { setStoreError(null); setForm({ ...form, role: role as AccountRole, storeIds: role === "ADMIN" ? [] : form.storeIds }); }} options={[{ value: "STORE_EVALUATOR", label: "门店评分账号" }, { value: "ADMIN", label: "总管理员" }]} />
            {form.role === "STORE_EVALUATOR" ? <StoreMultiSelect stores={stores} value={form.storeIds} onChange={(storeIds) => { setStoreError(null); setForm({ ...form, storeIds }); }} error={storeError} /> : <div className="rounded-lg bg-graphite-50 p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-graphite-600" aria-hidden="true" /><p className="text-xs leading-5 text-graphite-600">总管理员默认可以管理全部门店，无需逐店授权。</p></div></div>}
          </div>
          <button type="submit" disabled={isSaving} aria-busy={isSaving} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? <><InlineSpinner />正在保存…</> : editingId ? "保存修改" : "创建账号"}</button>
          {editingId ? <button type="button" onClick={resetForm} className="mt-2 min-h-11 w-full text-xs font-semibold text-graphite-600 hover:text-graphite-950">取消修改</button> : null}
        </form>
      </div>
      {resetTarget ? <ResetPasswordDialog account={resetTarget} onClose={() => setResetTarget(null)} onSaved={async () => { setResetTarget(null); showToast({ tone: "success", title: "密码已重置" }); await load(); }} /> : null}
      {deleteTarget ? <DeleteAccountDialog account={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={async () => { setDeleteTarget(null); showToast({ tone: "success", title: "账号已删除", description: "当前权限与会话已撤销，已关闭轮次历史保持不变。" }); await load(); }} /> : null}
    </PageContainer>
  );
}

function AccountStores({ account }: { account: ManagedAccount }) {
  if (account.canAccessAllStores) return <span className="font-semibold text-graphite-800">全部门店</span>;
  const visible = account.stores.slice(0, 2);
  const label = account.stores.map((store) => store.name).join("、");
  return <div title={label} className="flex min-w-0 flex-wrap items-center gap-1.5">{visible.map((store) => <span key={store.id} className="max-w-32 truncate rounded-md bg-graphite-100 px-2 py-1 text-xs font-semibold text-graphite-700">{store.name}</span>)}{account.stores.length > 2 ? <span className="rounded-md bg-graphite-100 px-2 py-1 text-xs font-semibold text-graphite-600">+{account.stores.length - 2}</span> : null}</div>;
}

function AccountActions({ account, currentAccountId, onEdit, onReset, onToggle, onDelete }: { account: ManagedAccount; currentAccountId?: string; onEdit: () => void; onReset: () => void; onToggle: () => void; onDelete: () => void }) {
  return <div className="flex flex-wrap justify-end gap-1"><IconButton label="编辑账号" onClick={onEdit} icon={Pencil} /><IconButton label="重置密码" onClick={onReset} icon={KeyRound} /><button type="button" onClick={onToggle} className="min-h-10 rounded-lg border border-graphite-200 px-2.5 text-xs font-semibold text-graphite-700 hover:bg-graphite-50">{account.isActive ? "停用" : "启用"}</button><IconButton label={account.id === currentAccountId ? "不能删除当前账号" : "删除账号"} onClick={onDelete} icon={Trash2} destructive disabled={account.id === currentAccountId} /></div>;
}

function DeleteAccountDialog({ account, onClose, onDeleted }: { account: ManagedAccount; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setDeleting(true);
    setError(null);
    try { await authRepository.deleteAccount(account.id); await onDeleted(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法删除账号。"); }
    finally { setDeleting(false); }
  }
  return <Dialog titleId="delete-account-title" onClose={onClose} closeDisabled={deleting} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><Trash2 className="h-5 w-5 text-red-700" aria-hidden="true" /><h2 id="delete-account-title" className="mt-4 text-xl font-semibold text-graphite-950">删除账号？</h2><p className="mt-3 text-sm text-graphite-700">账号：<strong>{account.username}</strong></p><p className="mt-1 text-sm text-graphite-700">可管理门店：{account.canAccessAllStores ? "全部门店" : account.stores.map((store) => store.name).join("、")}</p><ul className="mt-4 space-y-2 rounded-lg bg-red-50 p-4 text-sm leading-5 text-red-900"><li>该账号将立即无法登录，所有当前会话失效。</li><li>进行中的评分将不再计入本轮。</li><li>已关闭轮次与历史评价会继续保留。</li><li>此操作不能通过普通界面恢复。</li></ul>{error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={deleting} className="min-h-11 rounded-lg border border-graphite-200 px-4 text-sm font-semibold">取消</button><button type="button" onClick={() => void remove()} disabled={deleting} aria-busy={deleting} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{deleting ? <><InlineSpinner />正在删除…</> : "删除账号"}</button></div></Dialog>;
}

function ResetPasswordDialog({ account, onClose, onSaved }: { account: ManagedAccount; onClose: () => void; onSaved: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await authRepository.resetPassword(account.id, password); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法重置密码。"); } finally { setSaving(false); } }
  return <Dialog titleId="reset-password-title" onClose={onClose} closeDisabled={saving} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"><form onSubmit={submit} autoComplete="off"><RefreshCw className="h-5 w-5 text-graphite-700" aria-hidden="true" /><h2 id="reset-password-title" className="mt-4 text-lg font-semibold text-graphite-950">重置 {account.username} 的密码</h2><div className="mt-4"><Field label="新密码" type="password" value={password} onChange={setPassword} /></div>{error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-graphite-200 px-4 text-sm font-semibold">取消</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white">确认重置</button></div></form></Dialog>;
}
function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) { return <label className="block text-sm font-medium text-graphite-700">{label}<input required minLength={type === "password" ? 8 : undefined} autoComplete={type === "password" ? "new-password" : "off"} disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-graphite-300 px-3 disabled:bg-graphite-100" /></label>; }
function IconButton({ label, onClick, icon: Icon, destructive = false, disabled = false }: { label: string; onClick: () => void; icon: typeof Pencil; destructive?: boolean; disabled?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-35 ${destructive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-graphite-200 text-graphite-600 hover:bg-graphite-50"}`}><Icon className="h-4 w-4" aria-hidden="true" /></button>; }
function roleLabel(role: AccountRole) { return role === "ADMIN" ? "总管理员" : "门店评分账号"; }
