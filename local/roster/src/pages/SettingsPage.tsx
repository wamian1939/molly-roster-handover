import { Check, Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AppSelect } from "../components/ui/AppSelect";
import { DraftRoleReconciliation } from "../components/settings/DraftRoleReconciliation";
import { FormalJobCatalog } from "../components/settings/FormalJobCatalog";
import { PresetShortcutSettings } from "../components/settings/PresetShortcutSettings";
import { useToast } from "../components/ui/ToastProvider";
import { rosterRepository, type DraftRoleUsage } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import { useStoreSelection } from "../store/StoreContext";
import { verifiedShiftRoles } from "../lib/verifiedShiftRoles";
import { evaluateJobColor } from "../lib/evaluateJobColor";
import { assertRosterSettingsResponse, assertSavedRosterSettingsResponse, RosterSettingsMutationResponseError } from "../lib/rosterSettingsResponse";
import { assertRoleMutationResponse, RoleMutationResponseError } from "../lib/roleMutationResponse";
import { assertDraftRoleUsageResponse } from "../lib/draftRoleUsageResponse";
import type { RosterStoreSettings, ShiftRole } from "../types/roster";
import type { RosterStore, RosterStoreJob } from "../types/workforce";

const defaults = (storeId: string): RosterStoreSettings => ({ storeId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", fortnightAnchorDate: null, weeklyHourWarning: 38, dailyHourWarning: 10 });
const weekStartOptions = [
  { value: "1", label: "星期一" }, { value: "2", label: "星期二" }, { value: "3", label: "星期三" },
  { value: "4", label: "星期四" }, { value: "5", label: "星期五" }, { value: "6", label: "星期六" },
  { value: "0", label: "星期日" },
];
export function SettingsPage() {
  const { user } = useAuth(); const { showToast } = useToast();
  const canReadInactiveRoles = user?.role === "ADMIN";
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  const [stores, setStores] = useState<RosterStore[]>([]); const storeId = selectedStoreId;
  const roleMutationLocksRef = useRef(new Map<string, string>());
  const pendingSettingsStoresRef = useRef(new Set<string>());
  const activeStoreRef = useRef(storeId);
  const roleDraftRevisionRef = useRef(0);
  const loadSequenceRef = useRef(0);
  const usageSequenceRef = useRef(0);
  const [settings, setSettings] = useState<RosterStoreSettings>(defaults(storeId)); const [roles, setRoles] = useState<ShiftRole[]>([]);
  const [pendingSettingsStores, setPendingSettingsStores] = useState<Set<string>>(() => new Set());
  const [pendingRoleMutations, setPendingRoleMutations] = useState<Map<string, string>>(() => new Map());
  const [formalJobs, setFormalJobs] = useState<RosterStoreJob[]>([]);
  const [inactiveRoles, setInactiveRoles] = useState<ShiftRole[]>([]);
  const [draftRoleUsage, setDraftRoleUsage] = useState<DraftRoleUsage[]>([]);
  const [draftRoleUsageError, setDraftRoleUsageError] = useState<string | null>(null);
  const [draftRoleUsageLoading, setDraftRoleUsageLoading] = useState(false);
  const [loadedStoreId, setLoadedStoreId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState(""); const [roleCode, setRoleCode] = useState("");
  const settingsReady = Boolean(storeId && loadedStoreId === storeId && settings.storeId === storeId);
  const saving = pendingSettingsStores.has(storeId);
  const roleMutationId = pendingRoleMutations.get(storeId) ?? null;
  useLayoutEffect(() => { activeStoreRef.current = storeId; usageSequenceRef.current += 1; }, [storeId]);
  useEffect(() => { let active = true; workforceRepository.stores().then((result) => { if (!active) return; setStores(result.stores); initializeStoreId(result.stores.map((store) => store.id)); }).catch((cause) => { if (active) showToast({ tone: "error", title: "门店加载失败", description: message(cause) }); }); return () => { active = false; }; }, [initializeStoreId, showToast]);
  const load = useCallback(async (refreshSettings = true) => {
    if (!storeId || activeStoreRef.current !== storeId) return;
    const requestSequence = refreshSettings ? ++loadSequenceRef.current : loadSequenceRef.current;
    if (refreshSettings) setLoadedStoreId(null);
    const isCurrent = () => requestSequence === loadSequenceRef.current && activeStoreRef.current === storeId;
    const settingsRequest = refreshSettings ? rosterRepository.settings(storeId).then((saved) => {
      if (!isCurrent()) return;
      setSettings(assertRosterSettingsResponse(saved, storeId) ?? defaults(storeId));
      setLoadedStoreId(storeId);
    }).catch((cause) => {
      if (isCurrent()) showToast({ tone: "error", title: "设置加载失败", description: message(cause) });
    }) : Promise.resolve();
    const rolesRequest = Promise.all([
      rosterRepository.roles(storeId, { includeInactive: canReadInactiveRoles }),
      workforceRepository.jobs(storeId),
    ]).then(([currentRoles, currentJobs]) => {
      if (!isCurrent()) return;
      setFormalJobs(currentJobs.jobs.filter((job) => job.storeId === storeId && job.isActive));
      setRoles(verifiedShiftRoles(currentRoles, currentJobs.jobs, storeId));
      setInactiveRoles(currentRoles.filter((role) => role.storeId === storeId && role.isActive === false
        && currentJobs.jobs.some((job) => job.storeId === storeId && job.isActive && job.code === role.code && job.name === role.nameZh)));
    }).catch((cause) => {
      if (!isCurrent()) return;
      // A role mutation has already applied its returned row before the
      // follow-up list refresh; keep that committed result visible on failure.
      if (refreshSettings) {
        setFormalJobs([]);
        setRoles([]);
        setInactiveRoles([]);
      }
      showToast({ tone: "error", title: refreshSettings ? "岗位目录加载失败" : "岗位列表刷新失败", description: message(cause) });
    });
    await Promise.all([settingsRequest, rolesRequest]);
  }, [canReadInactiveRoles, showToast, storeId]);
  const loadDraftRoleUsage = useCallback(async () => {
    if (!storeId || activeStoreRef.current !== storeId) return;
    const usageSequence = ++usageSequenceRef.current;
    setDraftRoleUsageLoading(true);
    setDraftRoleUsageError(null);
    try {
      const response = await rosterRepository.draftRoleUsage(storeId);
      if (usageSequence !== usageSequenceRef.current || activeStoreRef.current !== storeId) return;
      const rows = assertDraftRoleUsageResponse(response);
      setDraftRoleUsage(rows);
      setDraftRoleUsageError(null);
    } catch (cause) {
      if (usageSequence !== usageSequenceRef.current || activeStoreRef.current !== storeId) return;
      setDraftRoleUsageError(message(cause));
    } finally {
      if (usageSequence === usageSequenceRef.current && activeStoreRef.current === storeId) setDraftRoleUsageLoading(false);
    }
  }, [storeId]);
  // Switching stores clears data from the prior scope before the new reads complete.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { roleDraftRevisionRef.current += 1; setSettings(defaults(storeId)); setRoles([]); setFormalJobs([]); setInactiveRoles([]); setDraftRoleUsage([]); setDraftRoleUsageError(null); setDraftRoleUsageLoading(false); setLoadedStoreId(null); setRoleName(""); setRoleCode(""); }, [storeId]);
  // Loading store-owned settings is the external synchronization for this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  // Draft role usage is supplementary and cannot delay the primary Settings form.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDraftRoleUsage(); }, [loadDraftRoleUsage]);
  async function saveSettings() {
    if (!settingsReady || pendingSettingsStoresRef.current.has(storeId)) return;
    const requestSequence = loadSequenceRef.current;
    pendingSettingsStoresRef.current.add(storeId);
    setPendingSettingsStores(new Set(pendingSettingsStoresRef.current));
    try {
      const submitted = { ...settings, storeId };
      const response = await rosterRepository.saveSettings(storeId, submitted);
      if (activeStoreRef.current === storeId) {
        const saved = assertSavedRosterSettingsResponse(response, submitted);
        if (requestSequence === loadSequenceRef.current) setSettings(saved);
        else await load();
        if (activeStoreRef.current === storeId) showToast({ tone: "success", title: "门店设置已保存" });
      }
    } catch (cause) {
      if (activeStoreRef.current === storeId && requestSequence === loadSequenceRef.current) showToast({ tone: "error", title: cause instanceof RosterSettingsMutationResponseError ? "保存结果未确认" : "保存失败", description: message(cause) });
    } finally {
      pendingSettingsStoresRef.current.delete(storeId);
      setPendingSettingsStores(new Set(pendingSettingsStoresRef.current));
    }
  }
  function beginRoleMutation(id: string) {
    if (roleMutationLocksRef.current.has(storeId)) return false;
    roleMutationLocksRef.current.set(storeId, id);
    setPendingRoleMutations(new Map(roleMutationLocksRef.current));
    return true;
  }
  function endRoleMutation(scope: string) {
    roleMutationLocksRef.current.delete(scope);
    setPendingRoleMutations(new Map(roleMutationLocksRef.current));
  }
  function applySavedRole(saved: ShiftRole, scope: string) {
    if (activeStoreRef.current !== scope) return;
    setRoles((current) => verifiedShiftRoles([...current.filter((role) => role.id !== saved.id), saved], formalJobs, scope));
    setInactiveRoles((current) => {
      const remaining = current.filter((role) => role.id !== saved.id);
      return saved.isActive === false && formalJobs.some((job) => job.storeId === scope && job.isActive && job.code === saved.code && job.name === saved.nameZh)
        ? [...remaining, saved] : remaining;
    });
  }
  function editRoleName(value: string) { roleDraftRevisionRef.current += 1; setRoleName(value); }
  function editRoleCode(value: string) { roleDraftRevisionRef.current += 1; setRoleCode(value); }
  async function createRole() {
    if (!settingsReady || !beginRoleMutation("create")) return;
    const submittedDraftRevision = roleDraftRevisionRef.current;
    const submitted = { storeId, code: roleCode, nameZh: roleName, colorToken: evaluateJobColor(matchingFormalJob?.colorToken) ?? "#334155", requiredSkillCodes: [] };
    try {
      const response = await rosterRepository.createRole(submitted);
      if (activeStoreRef.current === storeId) {
        const saved = assertRoleMutationResponse(response, { ...submitted, isActive: true });
        applySavedRole(saved, storeId);
        if (roleDraftRevisionRef.current === submittedDraftRevision) {
          setRoleName(""); setRoleCode("");
        }
        showToast({ tone: "success", title: "岗位已创建" }); await load(false);
      }
    } catch (cause) {
      if (activeStoreRef.current === storeId) showToast({ tone: "error", title: cause instanceof RoleMutationResponseError ? "岗位保存结果未确认" : "创建岗位失败", description: message(cause) });
    } finally { endRoleMutation(storeId); }
  }
  async function toggleRole(role: ShiftRole) {
    if (!settingsReady || role.storeId !== storeId || role.version === undefined || !beginRoleMutation(role.id)) return;
    const nextActive = !(role.isActive ?? true);
    try {
      const response = await rosterRepository.updateRole(role.id, { storeId, nameZh: role.nameZh, colorToken: evaluateJobColor(formalJobs.find((job) => job.id === role.formalJobId)?.colorToken) ?? role.colorToken, requiredSkillCodes: role.requiredSkillCodes, isActive: nextActive, displayOrder: role.displayOrder ?? 0, version: role.version });
      if (activeStoreRef.current === storeId) {
        const saved = assertRoleMutationResponse(response, { storeId, id: role.id, code: role.code, nameZh: role.nameZh, isActive: nextActive, requiredSkillCodes: role.requiredSkillCodes, previousVersion: role.version });
        applySavedRole(saved, storeId); showToast({ tone: "success", title: role.isActive === false ? "岗位已启用" : "岗位已停用" }); await load(false);
      }
    } catch (cause) {
      if (activeStoreRef.current === storeId) showToast({ tone: "error", title: cause instanceof RoleMutationResponseError ? "岗位保存结果未确认" : "岗位更新失败", description: message(cause) });
    } finally { endRoleMutation(storeId); }
  }
  function patch<K extends keyof RosterStoreSettings>(key: K, value: RosterStoreSettings[K]) { if (settingsReady) setSettings((current) => ({ ...current, [key]: value })); }
  const matchingFormalJob = formalJobs.find((job) => job.storeId === storeId && job.isActive && job.code === roleCode && job.name === roleName
    && !roles.some((role) => role.formalJobId === job.id)
    && !inactiveRoles.some((role) => role.code === job.code && role.nameZh === job.name));
  return <div className="min-w-0"><header className="flex min-w-0 flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="text-sm font-semibold text-brand-700">门店排班规则</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-graphite-950 sm:text-3xl">设置</h1><p className="mt-2 text-sm text-graphite-600">配置营业时段、排班粒度、工时预警、可用时间快捷码和 Evaluate 正式岗位目录。</p></div>{(user?.role === "ADMIN" || (user?.storeIds.length ?? 0) > 1) ? <div className="w-full min-w-0 sm:w-52"><AppSelect label="门店" value={selectedStoreId} onValueChange={setSelectedStoreId} options={stores.map((store) => ({ value: store.id, label: store.name }))} /></div> : null}</header>
    <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-2"><section className="min-w-0 rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel sm:p-6"><h2 className="flex items-center gap-2 text-base font-semibold text-graphite-950"><Settings2 className="h-4 w-4 text-brand-700" />排班规则</h2><fieldset disabled={!settingsReady || saving} className="contents"><div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"><TimeField label="营业开始" value={settings.openingTime} onChange={(value) => patch("openingTime", value)} /><TimeField label="营业结束" value={settings.closingTime} onChange={(value) => patch("closingTime", value)} /><AppSelect label="时间粒度" value={String(settings.slotIntervalMinutes)} onValueChange={(value) => patch("slotIntervalMinutes", Number(value) as 15 | 30 | 60)} options={[15,30,60].map((value) => ({ value: String(value), label: `${value} 分钟` }))} /><AppSelect label="默认周期" value={settings.cycleType} onValueChange={(value) => patch("cycleType", value as "WEEK" | "FORTNIGHT")} options={[{ value: "WEEK", label: "一周" }, { value: "FORTNIGHT", label: "双周" }]} /><AppSelect label="周起始日" value={String(settings.weekStartsOn)} onValueChange={(value) => patch("weekStartsOn", Number(value))} options={weekStartOptions} /><NumberField label="最短班次（分钟）" value={settings.minimumShiftMinutes} onChange={(value) => patch("minimumShiftMinutes", value)} /><NumberField label="默认休息（分钟）" value={settings.defaultBreakMinutes} onChange={(value) => patch("defaultBreakMinutes", value)} /><NumberField label="周工时预警" value={settings.weeklyHourWarning} onChange={(value) => patch("weeklyHourWarning", value)} /><NumberField label="日工时预警" value={settings.dailyHourWarning} onChange={(value) => patch("dailyHourWarning", value)} /></div>{settings.cycleType === "FORTNIGHT" ? <label className="mt-4 block text-sm font-semibold text-graphite-700">双周起始日期<input type="date" className="native-input mt-1.5" value={settings.fortnightAnchorDate ?? ""} onChange={(event) => patch("fortnightAnchorDate", event.target.value || null)} /><span className="mt-1 block text-xs font-normal text-graphite-600">选择双周周期的第一天，必须与周起始日一致。此日期决定之后每个 14 天周期。</span></label> : null}</fieldset><button type="button" disabled={!settingsReady || saving || !storeId || (settings.cycleType === "FORTNIGHT" && !settings.fortnightAnchorDate)} onClick={() => void saveSettings()} className="calendar-primary-button mt-5"><Check className="h-4 w-4" />{saving ? "正在保存" : "保存规则"}</button></section>
      <section className="min-w-0 rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel sm:p-6"><h2 className="text-base font-semibold text-graphite-950">岗位关联</h2><p className="mt-1 text-xs text-graphite-500">岗位颜色在 Evaluate 正式岗位设置中维护，日历和员工页使用该颜色；已发布班次保留历史快照。</p><FormalJobCatalog key={storeId} storeId={storeId} jobs={formalJobs} roles={roles} inactiveRoles={inactiveRoles} settingsReady={settingsReady} onAssociate={(job) => { editRoleName(job.name); editRoleCode(job.code ?? ""); }} /><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">岗位名称</span><input className="native-input" value={roleName} onChange={(event) => editRoleName(event.target.value)} placeholder="必须与 Evaluate 正式岗位名称一致" /></label><label className="min-w-0"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">代码</span><input className="native-input" value={roleCode} onChange={(event) => editRoleCode(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="cashier" /></label></div><button type="button" disabled={!settingsReady || Boolean(roleMutationId) || !matchingFormalJob || !storeId} onClick={() => void createRole()} className="calendar-text-button mt-4"><Plus className="h-4 w-4" />{roleMutationId === "create" ? "正在创建" : "关联正式岗位"}</button><div className="mt-5 space-y-2">{(settingsReady ? roles : []).map((role) => <article key={role.id} className={`flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-graphite-200 p-3 ${role.isActive === false ? "opacity-60" : ""}`}><span className="flex min-w-0 flex-[1_1_12rem] items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.colorToken }} /><span className="min-w-0"><strong className="block truncate text-sm text-graphite-950">{role.nameZh}</strong><span className="block break-words text-xs text-graphite-500">{role.code}</span>{draftRoleUsage.find((usage) => usage.id === role.id)?.shiftCount ? <span className="mt-1 block text-xs text-amber-800">草稿班次使用中，请先改派再停用</span> : null}</span></span>{role.storeId ? <div className="flex shrink-0 flex-wrap items-center gap-2"><button type="button" disabled={!settingsReady || Boolean(roleMutationId) || (role.isActive !== false && draftRoleUsage.some((usage) => usage.id === role.id && usage.shiftCount > 0))} title={role.isActive !== false && draftRoleUsage.some((usage) => usage.id === role.id && usage.shiftCount > 0) ? "先改派使用此岗位的草稿班次，再停用岗位" : undefined} onClick={() => void toggleRole(role)} className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${role.isActive === false ? "text-emerald-700 hover:bg-emerald-50" : "text-red-700 hover:bg-red-50"}`}>{roleMutationId === role.id ? "正在更新" : role.isActive === false ? "重新启用" : "停用"}</button></div> : <span className="shrink-0 rounded-full bg-graphite-100 px-2 py-1 text-xs font-semibold text-graphite-600">系统</span>}</article>)}</div><InactiveFormalRoleList roles={inactiveRoles} jobs={formalJobs} activeRoles={roles} disabled={!settingsReady || Boolean(roleMutationId)} mutationId={roleMutationId} onToggle={(role) => void toggleRole(role)} /></section></div>
    {storeId ? <PresetShortcutSettings key={storeId} storeId={storeId} /> : null}
    {settingsReady ? <DraftRoleReconciliation storeId={storeId} usage={draftRoleUsage} verifiedRoleIds={new Set(roles.map((role) => role.id))} error={draftRoleUsageError} loading={draftRoleUsageLoading} onRetry={() => void loadDraftRoleUsage()} /> : null}</div>;
}
function InactiveFormalRoleList({ roles, jobs, activeRoles, disabled, mutationId, onToggle }: {
  roles: ShiftRole[];
  jobs: RosterStoreJob[];
  activeRoles: ShiftRole[];
  disabled: boolean;
  mutationId: string | null;
  onToggle: (role: ShiftRole) => void;
}) {
  if (!roles.length) return null;
  return <section className="mt-6 border-t border-graphite-200 pt-5" aria-label="已停用的本店正式岗位">
    <h3 className="text-sm font-semibold text-graphite-950">已停用的本店正式岗位</h3>
    <p className="mt-1 text-xs text-graphite-600">仅显示仍与 Evaluate 当前正式岗位的代码和名称完全一致的本店岗位。</p>
    <div className="mt-3 space-y-2">{roles.map((role) => {
      const job = jobs.find((item) => item.code === role.code && item.name === role.nameZh);
      const taken = activeRoles.some((active) => active.formalJobId === job?.id);
      return <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-graphite-200 px-3 py-2 text-sm">
        <span><strong>{role.nameZh}</strong><span className="ml-2 text-graphite-600">{role.code}</span></span>
        {taken ? <span className="text-amber-800">已有有效关联，无法重新启用</span> : <button type="button" className="calendar-text-button" disabled={disabled} onClick={() => onToggle(role)}>{mutationId === role.id ? "正在更新" : "重新启用"}</button>}
      </div>;
    })}</div>
  </section>;
}
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-1.5 block text-sm font-semibold text-graphite-700">{label}</span><input type="time" className="native-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1.5 block text-sm font-semibold text-graphite-700">{label}</span><input type="number" min={0} className="native-input" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }
