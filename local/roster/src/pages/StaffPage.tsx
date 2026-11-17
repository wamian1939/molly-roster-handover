import { BookmarkPlus, CalendarDays, CheckCircle2, CircleAlert, FileCode2, RefreshCw, Search, UsersRound } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AvailabilityEditor } from "../components/staff/AvailabilityEditor";
import { ManualAvailabilityBatchDialog } from "../components/staff/ManualAvailabilityBatchDialog";
import { PresetTimeSlotScriptDialog } from "../components/staff/PresetTimeSlotScriptDialog";
import { AppSelect } from "../components/ui/AppSelect";
import { ApiRequestError } from "../lib/apiClient";
import { InlineSpinner, useToast } from "../components/ui/ToastProvider";
import { applyAvailabilityTemplate, availabilityDraftErrors, availabilityEntries, availabilityTemplateSlots, buildAvailabilityDrafts, createAvailabilitySlot, hasContradictoryUnknownTemplateDays, hasNonportableAvailabilityOccurrence, type AvailabilityDayDraft } from "../lib/availability";
import { dateInputValue, weekRange } from "../lib/dateTime";
import { roleColorStyle } from "../lib/roleColor";
import { evaluateJobColor } from "../lib/evaluateJobColor";
import { assertRosterSettingsResponse } from "../lib/rosterSettingsResponse";
import { addCalendarDays, storeParts } from "../lib/storeTime";
import { filterEmployees } from "../lib/scheduling";
import { rosterRepository } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import { useStoreSelection } from "../store/StoreContext";
import type { AvailabilityStatus, AvailabilityTemplate, EmployeeAvailability } from "../types/roster";
import type { RosterEmployee, RosterStore, RosterStoreJob } from "../types/workforce";

export function StaffPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  const [stores, setStores] = useState<RosterStore[]>([]);
  const storeId = selectedStoreId;
  const [employeeRows, setEmployeeRows] = useState<RosterEmployee[]>([]);
  const [workforceStoreId, setWorkforceStoreId] = useState<string | null>(null);
  const [workforceGeneratedAt, setWorkforceGeneratedAt] = useState<string | null>(null);
  const [workforceError, setWorkforceError] = useState<string | null>(null);
  const [workforceLoading, setWorkforceLoading] = useState(false);
  const [workforceRefreshNonce, setWorkforceRefreshNonce] = useState(0);
  const [templates, setTemplates] = useState<AvailabilityTemplate[]>([]);
  const [formalJobs, setFormalJobs] = useState<RosterStoreJob[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [storeHours, setStoreHours] = useState({ openingTime: "09:00", closingTime: "22:00" });
  const [timezoneStoreId, setTimezoneStoreId] = useState<string | null>(null);
  const [configuredTimezoneStoreId, setConfiguredTimezoneStoreId] = useState<string | null>(null);
  const [cycleAvailability, setCycleAvailability] = useState<EmployeeAvailability[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [employeeType, setEmployeeType] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [positionId, setPositionId] = useState("ALL");
  const [anchorDate, setAnchorDate] = useState(dateInputValue(new Date()));
  const [cycleDays, setCycleDays] = useState(7);
  const [days, setDays] = useState<AvailabilityDayDraft[]>([]);
  const [availabilityScope, setAvailabilityScope] = useState<{ storeId: string; employeeId: string; from: string; to: string } | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityConflict, setAvailabilityConflict] = useState(false);
  const [availabilitySaveUncertain, setAvailabilitySaveUncertain] = useState(false);
  const [availabilityRefreshNonce, setAvailabilityRefreshNonce] = useState(0);
  const [templateNamesByStore, setTemplateNamesByStore] = useState<Record<string, string>>({});
  const templateName = templateNamesByStore[storeId] ?? "";
  const [visibleCount, setVisibleCount] = useState(60);
  const [loading, setLoading] = useState(false);
  const pendingSaveStoresRef = useRef(new Set<string>());
  const [savingStoreIds, setSavingStoreIds] = useState<Set<string>>(() => new Set());
  const saving = savingStoreIds.has(storeId);
  const [scriptStoreId, setScriptStoreId] = useState<string | null>(null);
  const [scriptEmployeeTarget, setScriptEmployeeTarget] = useState<{ id: string; displayName: string } | null>(null);
  const [scriptWeekByStore, setScriptWeekByStore] = useState<Record<string, "CURRENT" | "NEXT">>({});
  const [manualTarget, setManualTarget] = useState<{ storeId: string; employeeId: string; employeeName: string } | null>(null);
  const employees = useMemo(() => workforceStoreId === storeId ? employeeRows : [], [employeeRows, storeId, workforceStoreId]);
  const employee = employees.find((item) => item.id === selectedEmployeeId) ?? null;
  const selectedEmployeeActive = Boolean(employee);
  const workforceReady = workforceStoreId === storeId && !workforceLoading && !workforceError;
  const range = useMemo(() => cycleRange(anchorDate, cycleDays, weekStartsOn), [anchorDate, cycleDays, weekStartsOn]);
  const activeSelectionRef = useRef({ storeId, employeeId: selectedEmployeeId, from: range.from, to: range.to });
  const lastLoadedWorkforceStoreRef = useRef<string | null>(null);
  const availabilityLoadRevisionRef = useRef(0);
  const availabilityDraftRevisionRef = useRef(0);
  const templateLoadGenerationRef = useRef(0);
  useLayoutEffect(() => { activeSelectionRef.current = { storeId, employeeId: selectedEmployeeId, from: range.from, to: range.to }; }, [storeId, selectedEmployeeId, range.from, range.to]);
  useLayoutEffect(() => { templateLoadGenerationRef.current += 1; }, [storeId]);

  useEffect(() => {
    let active = true;
    workforceRepository.stores().then((result) => {
      if (!active) return;
      setStores(result.stores);
      initializeStoreId(result.stores.map((store) => store.id));
    }).catch((cause) => { if (active) showToast({ tone: "error", title: "门店加载失败", description: message(cause) }); });
    return () => { active = false; };
  }, [initializeStoreId, showToast]);

  useEffect(() => {
    if (!storeId) return;
    // External workforce reads are independent of availability drafts and store settings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let active = true; setWorkforceLoading(true); setWorkforceError(null);
    workforceRepository.employees(storeId).then((result) => {
      if (!active) return;
      const changedStore = lastLoadedWorkforceStoreRef.current !== storeId;
      lastLoadedWorkforceStoreRef.current = storeId;
      setEmployeeRows(result.employees.filter((item) => item.isActive));
      setWorkforceStoreId(storeId);
      setWorkforceGeneratedAt(result.generatedAt);
      setWorkforceError(null);
      setSelectedEmployeeId((current) => !current || changedStore
        ? result.employees.find((item) => item.isActive)?.id ?? ""
        : current);
    }).catch((cause) => { if (active) setWorkforceError(message(cause)); }).finally(() => { if (active) setWorkforceLoading(false); });
    return () => { active = false; };
  }, [storeId, workforceRefreshNonce]);

  useEffect(() => {
    if (!storeId) return;
    const refresh = () => { if (document.visibilityState === "visible") setWorkforceRefreshNonce((current) => current + 1); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    // Data fetching is the external synchronization owned by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let active = true; setLoading(true); setTemplates([]); setFormalJobs([]); setPositionId("ALL");
    const templateGeneration = templateLoadGenerationRef.current;
    void rosterRepository.availabilityTemplates(storeId).then((availabilityTemplates) => {
      if (active && templateLoadGenerationRef.current === templateGeneration) {
        setTemplates(availabilityTemplates.filter((template) => template.isActive));
      }
    }).catch((cause) => { if (active) showToast({ tone: "error", title: "可用时间模板加载失败", description: message(cause) }); });
    void workforceRepository.jobs(storeId).then((jobs) => {
      if (active) setFormalJobs(jobs.jobs.filter((job) => job.storeId === storeId && job.isActive));
    }).catch((cause) => { if (active) showToast({ tone: "error", title: "正式岗位目录加载失败", description: message(cause) }); });
    void rosterRepository.settings(storeId).then((response) => {
      if (!active) return;
      const settings = assertRosterSettingsResponse(response, storeId);
      const storeTimezone = settings?.timezone ?? "UTC";
      setTimezone(storeTimezone);
      setConfiguredTimezoneStoreId(settings ? storeId : null);
      setWeekStartsOn(settings?.weekStartsOn ?? 1);
      setStoreHours({ openingTime: settings?.openingTime ?? "09:00", closingTime: settings?.closingTime ?? "22:00" });
      setTimezoneStoreId(storeId);
      setAnchorDate(storeParts(new Date(), storeTimezone).date);
    }).catch((cause) => { if (active) {
      setConfiguredTimezoneStoreId(null);
      setTimezoneStoreId(null);
      setAvailabilityScope(null);
      showToast({ tone: "error", title: "门店设置加载失败", description: message(cause) });
    } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast, storeId]);

  useEffect(() => {
    if (!storeId || !selectedEmployeeId || timezoneStoreId !== storeId || configuredTimezoneStoreId !== storeId || !selectedEmployeeActive) return;
    // Data fetching is the external synchronization owned by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let active = true; availabilityLoadRevisionRef.current += 1; setLoading(true); setAvailabilityScope(null); setAvailabilityError(null); setAvailabilityConflict(false); setAvailabilitySaveUncertain(false);
    rosterRepository.availability(storeId, range.from, range.to, selectedEmployeeId).then((rows) => {
      if (active) {
        setCycleAvailability(rows);
        setDays(buildAvailabilityDrafts(range.dates, rows, timezone));
        setAvailabilityScope({ storeId, employeeId: selectedEmployeeId, from: range.from, to: range.to });
      }
    }).catch((cause) => { if (active) { setAvailabilityError(message(cause)); showToast({ tone: "error", title: "可用时间加载失败", description: message(cause) }); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [availabilityRefreshNonce, range, selectedEmployeeActive, selectedEmployeeId, showToast, storeId, timezone, timezoneStoreId, configuredTimezoneStoreId]);

  const formalPositions = useMemo(() => [...new Map(employees.flatMap((item) => item.positions ?? []).map((position) => [position.id, position.name])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "zh-CN")), [employees]);
  const jobByPositionId = useMemo(() => new Map(formalJobs.map((job) => [job.id, job])), [formalJobs]);
  const filtered = useMemo(() => filterEmployees(employees, search, employeeType, tier)
    .filter((item) => positionId === "ALL" || item.positions?.some((position) => position.id === positionId)), [employeeType, employees, positionId, search, tier]);
  const visibleEmployees = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const availabilityReady = availabilityScope?.storeId === storeId && availabilityScope.employeeId === selectedEmployeeId
    && availabilityScope.from === range.from && availabilityScope.to === range.to;
  const employeeAvailability = employee && availabilityReady ? availabilitySummary(cycleAvailability.filter((row) => row.employeeId === employee.id)) : null;
  const storeClockReady = timezoneStoreId === storeId && configuredTimezoneStoreId === storeId;
  const currentDays = availabilityReady ? days : [];
  const draftErrors = useMemo(() => availabilityReady ? availabilityDraftErrors(days, timezone) : new Map<string, string>(), [availabilityReady, days, timezone]);
  function beginSave(targetStoreId: string) {
    if (pendingSaveStoresRef.current.has(targetStoreId)) return false;
    pendingSaveStoresRef.current.add(targetStoreId);
    setSavingStoreIds(new Set(pendingSaveStoresRef.current));
    return true;
  }
  function finishSave(targetStoreId: string) {
    pendingSaveStoresRef.current.delete(targetStoreId);
    setSavingStoreIds(new Set(pendingSaveStoresRef.current));
  }
  function editDays(next: AvailabilityDayDraft[] | ((current: AvailabilityDayDraft[]) => AvailabilityDayDraft[])) {
    availabilityDraftRevisionRef.current += 1;
    setDays(next);
  }
  function applyTemplate(status: AvailabilityStatus, startTime = "09:00", endTime = "22:00", endNextDay = false) { if (storeClockReady && availabilityReady && !loading) editDays((current) => current.map((day) => ({ ...day, slots: status === "UNKNOWN" ? [] : [createAvailabilitySlot({ status, startTime, endTime, endNextDay })] }))); }
  function applySavedTemplate(template: AvailabilityTemplate) {
    if (!storeClockReady || !availabilityReady || loading) return;
    if (hasContradictoryUnknownTemplateDays(template)) {
      showToast({ tone: "error", title: "无法套用可用时间模板", description: "模板同一天同时包含未知和其他时段，请先修正模板。" });
      return;
    }
    editDays((current) => applyAvailabilityTemplate(current, template));
  }

  async function save() {
    if (!employee || !storeClockReady || !workforceReady || !availabilityReady || availabilityConflict || availabilitySaveUncertain || loading || saving) return;
    if (draftErrors.size) { showToast({ tone: "error", title: "可用时间存在冲突", description: "请先修正同日重叠或无效时间段。" }); return; }
    const loadRevision = availabilityLoadRevisionRef.current;
    const draftRevision = availabilityDraftRevisionRef.current;
    const stillCurrent = () => {
      const current = activeSelectionRef.current;
      return loadRevision === availabilityLoadRevisionRef.current
        && current.storeId === storeId && current.employeeId === employee.id && current.from === range.from && current.to === range.to;
    };
    if (!beginSave(storeId)) return;
    try {
      const savedRows = await rosterRepository.replaceAvailability({ storeId, employeeId: employee.id, dates: range.dates,
        expectedRows: cycleAvailability.filter((row) => range.dates.includes(row.date)).map(({ id, version }) => ({ id, version })),
        entries: availabilityEntries(days, timezone).map((entry) => ({ ...entry,
          source: entry.source === "SCRIPT" ? "MANUAL" as const : entry.source })) });
      if (stillCurrent()) {
        setCycleAvailability(savedRows);
        const hasNewerDraft = draftRevision !== availabilityDraftRevisionRef.current;
        if (!hasNewerDraft) setDays(buildAvailabilityDrafts(range.dates, savedRows, timezone));
        showToast({ tone: "success", title: "可用时间已保存", description: `${employee.displayName} · ${range.from} 至 ${range.to}${hasNewerDraft ? " · 后续修改尚未保存" : ""}` });
      }
    } catch (cause) {
      if (stillCurrent()) {
        const uncertain = cause instanceof ApiRequestError && (cause.status === 0 || cause.status >= 500);
        if (uncertain) setAvailabilitySaveUncertain(true);
        else if (cause instanceof ApiRequestError && cause.status === 409 && cause.validation?.code === "STALE_VERSION") setAvailabilityConflict(true);
        showToast({ tone: uncertain ? "info" : "error", title: uncertain ? "结果尚未确认" : "保存失败", description: message(cause) });
      }
    }
    finally { finishSave(storeId); }
  }

  async function saveAsTemplate() {
    if (!storeClockReady || !availabilityReady || loading || saving) return;
    const slots = availabilityTemplateSlots(days);
    const name = templateName.trim();
    if (!name || !slots.length || draftErrors.size) return;
    if (hasNonportableAvailabilityOccurrence(days)) {
      showToast({ tone: "error", title: "无法保存为模板", description: "夏令时回拨的第二次时间仅适用于当日，请保存员工可用时间。" });
      return;
    }
    if (!beginSave(storeId)) return;
    try {
      await rosterRepository.createAvailabilityTemplate({ storeId, name, slots });
      setTemplateNamesByStore((current) => (current[storeId] ?? "").trim() === name
        ? { ...current, [storeId]: "" } : current);
      if (activeSelectionRef.current.storeId !== storeId) return;
      const refreshGeneration = ++templateLoadGenerationRef.current;
      try {
        const updatedTemplates = (await rosterRepository.availabilityTemplates(storeId)).filter((template) => template.isActive);
        if (activeSelectionRef.current.storeId !== storeId || templateLoadGenerationRef.current !== refreshGeneration) return;
        setTemplates(updatedTemplates);
        showToast({ tone: "success", title: "可用时间模板已保存", description: `${slots.length} 个时间段` });
      } catch (cause) {
        if (activeSelectionRef.current.storeId === storeId && templateLoadGenerationRef.current === refreshGeneration) showToast({ tone: "info", title: "可用时间模板已保存", description: `列表刷新失败：${message(cause)}` });
      }
    } catch (cause) { if (activeSelectionRef.current.storeId === storeId) showToast({ tone: "error", title: "模板保存失败", description: message(cause) }); }
    finally { finishSave(storeId); }
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-700">Evaluate Molly 实时员工目录</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-graphite-950 sm:text-3xl">员工与可用时间</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-600">员工资料只读；Roster 仅维护排班可用时段。未知不会被视为可用。</p></div>{(user?.role === "ADMIN" || (user?.storeIds.length ?? 0) > 1) ? <div className="min-w-52"><AppSelect label="门店" value={selectedStoreId} onValueChange={(value) => { setManualTarget(null); setSelectedStoreId(value); }} options={stores.map((store) => ({ value: store.id, label: store.name }))} /></div> : null}</header>
      {import.meta.env.DEV && <a href="/employee/availability" target="_blank" rel="noreferrer" className="calendar-text-button mt-4 inline-flex">打开员工个人报班演示 · Hurstville</a>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
        <p className="text-xs font-medium text-graphite-600">{workforceLoading ? "正在同步员工资料" : workforceError ? "员工资料更新失败，当前列表可能已过期" : workforceGeneratedAt && workforceStoreId === storeId ? `员工资料更新于 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(workforceGeneratedAt))}` : "等待员工资料"}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className="calendar-text-button" disabled={!storeId || !workforceReady || !storeClockReady} onClick={() => { setScriptEmployeeTarget(null); setScriptStoreId(storeId); }}><FileCode2 className="h-4 w-4" />Edit Preset Time Slot Script</button><button type="button" className="calendar-text-button" onClick={() => setWorkforceRefreshNonce((current) => current + 1)} disabled={!storeId || workforceLoading}><RefreshCw className={`h-4 w-4 ${workforceLoading ? "animate-spin" : ""}`} />刷新员工资料</button></div>
      </div>
      {timezoneStoreId === storeId && !storeClockReady ? <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">当前门店未确认时区。请先在<a href="/settings" className="mx-1 font-semibold underline">设置</a>中保存门店时区，再录入可用时间。</p> : null}
      {workforceError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">员工资料暂时无法确认，可用时间提交已暂停。请刷新后重试。 {workforceError}</p> : null}
      <div className="mt-6 grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-graphite-200 bg-white p-4 shadow-panel">
          <label className="relative block"><span className="sr-only">搜索员工</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-500" /><input className="native-input staff-directory-search" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(60); }} placeholder="搜索员工" /></label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <AppSelect ariaLabel="员工类型" value={employeeType} onValueChange={(value) => { setEmployeeType(value); setVisibleCount(60); }} options={[{ value: "ALL", label: "全部类型" }, { value: "REGULAR", label: "正式员工" }, { value: "TRAINING", label: "培训员工" }]} />
            <AppSelect ariaLabel="员工 Tier" value={tier} onValueChange={(value) => { setTier(value); setVisibleCount(60); }} options={[{ value: "ALL", label: "全部 Tier" }, ...[1, 2, 3, 4, 5].map((value) => ({ value: `T${value}`, label: `T${value}` }))]} />
            <AppSelect ariaLabel="按正式岗位筛选" value={positionId} onValueChange={(value) => { setPositionId(value); setVisibleCount(60); }} options={[{ value: "ALL", label: "全部岗位" }, ...formalPositions.map(([value, label]) => ({ value, label }))]} />
          </div>
          <p className="mt-3 text-xs font-semibold text-graphite-500">显示 {filtered.length} / {employees.length} 名在职员工</p>
          <div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto">
            {visibleEmployees.map((item) => {
              const availability = item.id !== selectedEmployeeId ? { label: "选择后查看可用时间", tone: "text-graphite-500" }
                : availabilityReady ? availabilitySummary(cycleAvailability.filter((row) => row.employeeId === item.id))
                  : { label: "正在加载可用时间", tone: "text-graphite-500" };
              return <button key={item.id} type="button" onClick={() => { setManualTarget(null); setSelectedEmployeeId(item.id); }} className={`staff-directory-card ${item.id === selectedEmployeeId ? "is-selected" : ""}`}>
                <span className="block truncate text-sm font-semibold text-graphite-950">{item.displayName}</span>
                <span className="mt-1 block text-xs text-graphite-600">{item.employeeType === "TRAINING" ? "培训员工" : item.employmentType ?? "正式员工"} · {item.officialScore ? `${item.officialScore.tier} / ${item.officialScore.score.toFixed(1)}` : "暂无正式评分"}</span>
                <FormalPositionBadges employee={item} jobByPositionId={jobByPositionId} />
                <span className={`mt-2 block text-[11px] font-semibold ${availability.tone}`}>{availability.label}</span>
              </button>;
            })}
            {visibleEmployees.length < filtered.length ? <button type="button" className="calendar-text-button w-full" onClick={() => setVisibleCount((current) => current + 60)}>再显示 {Math.min(60, filtered.length - visibleEmployees.length)} 名员工</button> : null}
            {!filtered.length ? <p className="p-6 text-center text-sm text-graphite-600">{workforceLoading || workforceStoreId !== storeId ? "正在加载员工资料" : workforceError ? "暂时无法确认员工资料，请刷新后重试" : employees.length ? "无匹配员工" : "当前门店暂无在职员工"}</p> : null}
          </div>
        </aside>
        <main className="min-w-0 rounded-2xl border border-graphite-200 bg-white shadow-panel">
          {!employee ? <div className="grid min-h-80 place-items-center p-8 text-center"><div><UsersRound className="mx-auto h-7 w-7 text-brand-700" /><p className="mt-3 text-sm font-semibold text-graphite-800">{workforceReady && selectedEmployeeId ? "该员工已不在当前门店，请选择其他员工" : "请选择员工"}</p></div></div> : <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-graphite-200 p-5 sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-graphite-950">{employee.displayName}</h2><span className="rounded-full bg-graphite-100 px-2 py-1 text-xs font-semibold text-graphite-700">{employee.employeeType === "TRAINING" ? "培训" : employee.employmentType ?? "正式"}</span></div>
                <FormalPositionBadges employee={employee} jobByPositionId={jobByPositionId} prominent />
                <p className="mt-2 text-xs font-semibold text-graphite-600">可用时间：{employeeAvailability?.label ?? "正在加载"}</p>
              </div>
              {employee.officialScore ? <div className="rounded-2xl bg-graphite-950 px-4 py-3 text-white"><p className="text-xs text-white/60">正式评分</p><p className="mt-1 text-xl font-semibold tabular-nums">{employee.officialScore.score.toFixed(1)} <span className="text-sm text-white/70">{employee.officialScore.tier}</span></p></div> : null}
            </div>
            <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
              <button type="button" className="calendar-text-button" disabled={!storeId || !workforceReady || !storeClockReady || loading} onClick={() => setManualTarget({ storeId, employeeId: employee.id, employeeName: employee.displayName })}><CalendarDays className="h-4 w-4" />手动录入多日期</button>
              <button type="button" className="calendar-text-button" disabled={!storeId || !workforceReady || !storeClockReady || loading} onClick={() => { setScriptEmployeeTarget({ id: employee.id, displayName: employee.displayName }); setScriptStoreId(storeId); }}><FileCode2 className="h-4 w-4" />Script Record Time · {employee.displayName}</button>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-end gap-3"><label><span className="mb-1.5 block text-sm font-semibold text-graphite-700">所在周期</span><input type="date" className="native-input" value={anchorDate} onInput={(event) => setAnchorDate(event.currentTarget.value)} onChange={(event) => setAnchorDate(event.target.value)} /></label><div className="w-32"><AppSelect label="周期" value={String(cycleDays)} onValueChange={(value) => setCycleDays(Number(value))} options={[{ value: "7", label: "一周" }, { value: "14", label: "双周" }]} /></div><button type="button" className="calendar-text-button" disabled={!storeClockReady || !availabilityReady || loading} onClick={() => applyTemplate("AVAILABLE", storeHours.openingTime, storeHours.closingTime, storeHours.closingTime < storeHours.openingTime)}>营业时段可用</button><button type="button" className="calendar-text-button" disabled={!storeClockReady || !availabilityReady || loading} onClick={() => applyTemplate("AVAILABLE", "09:00", "17:00")}>标准可用</button><button type="button" className="calendar-text-button" disabled={!storeClockReady || !availabilityReady || loading} onClick={() => applyTemplate("AVAILABLE", "16:00", "22:00")}>晚班可用</button><button type="button" className="calendar-text-button" disabled={!storeClockReady || !availabilityReady || loading} onClick={() => applyTemplate("UNKNOWN")}>全部未知</button>{templates.map((template) => <button key={template.id} type="button" className="calendar-text-button" disabled={!storeClockReady || !availabilityReady || loading} onClick={() => applySavedTemplate(template)}>套用：{template.name}</button>)}</div>
              {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-graphite-600"><RefreshCw className="h-4 w-4 animate-spin" />正在更新</p> : null}
              {availabilityError ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><span>无法确认当前员工的可用时间：{availabilityError}</span><button type="button" className="calendar-text-button" onClick={() => setAvailabilityRefreshNonce((value) => value + 1)}>重试可用时间</button></div> : null}
              {availabilityConflict ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><span>可用时间已被其他管理员修改。当前表单内容仍在此页；重新加载后请核对最新时段再编辑。</span><button type="button" className="calendar-text-button" onClick={() => setAvailabilityRefreshNonce((value) => value + 1)}>重新加载可用时间</button></div> : null}
              {availabilitySaveUncertain ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><span>上次保存结果尚未确认。当前表单内容仍在此页；请重新加载可用时间并核对最新记录后再编辑。</span><button type="button" className="calendar-text-button" onClick={() => setAvailabilityRefreshNonce((value) => value + 1)}>重新加载可用时间</button></div> : null}
              {storeClockReady ? <AvailabilityEditor days={currentDays} errors={draftErrors} timezone={timezone} onChange={editDays} /> : null}
              {storeClockReady ? <><div className="mt-5 grid min-w-0 gap-3 rounded-xl bg-graphite-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-graphite-600">将当前多时段配置保存为模板</span><input className="native-input" value={templateName} onChange={(event) => { const name = event.target.value; setTemplateNamesByStore((current) => ({ ...current, [storeId]: name })); }} placeholder="例如：上下午分段" /></label><button type="button" onClick={() => void saveAsTemplate()} disabled={saving || loading || !availabilityReady || !templateName.trim() || !availabilityTemplateSlots(currentDays).length || Boolean(draftErrors.size)} className="calendar-text-button self-end"><BookmarkPlus className="h-4 w-4" />保存为模板</button></div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-graphite-500"><CircleAlert className="h-4 w-4" />无时间段表示未知；不可用和时段外排班会在选择器中警告。</p><button type="button" onClick={() => void save()} disabled={saving || loading || !workforceReady || !availabilityReady || availabilityConflict || availabilitySaveUncertain || Boolean(draftErrors.size)} className="calendar-primary-button">{saving ? <InlineSpinner /> : <CheckCircle2 className="h-4 w-4" />}{saving ? "正在保存" : "保存可用时间"}</button></div></> : null}
            </div>
          </>}
        </main>
      </div>
      {scriptStoreId === storeId && storeId ? <PresetTimeSlotScriptDialog key={`${storeId}:${scriptEmployeeTarget?.id ?? "bulk"}`} storeId={storeId} employees={employees} employeeTarget={scriptEmployeeTarget}
        initialWeek={scriptWeekByStore[storeId] ?? "NEXT"} onWeekChange={(nextWeek) => setScriptWeekByStore((current) => ({ ...current, [storeId]: nextWeek }))}
        onClose={() => { setScriptStoreId(null); setScriptEmployeeTarget(null); }} onCommitted={(result) => { setScriptStoreId(null); setScriptEmployeeTarget(null); setAvailabilityRefreshNonce((value) => value + 1); showToast(result.alreadyImported
        ? { tone: "info", title: "脚本此前已导入", description: `本次没有新增记录；此前导入新增 ${result.created} 条` }
        : { tone: "success", title: "可用时间脚本已导入", description: `新增 ${result.created} 条，不变 ${result.unchanged} 条` }); }} /> : null}
      {manualTarget?.storeId === storeId && manualTarget.employeeId === selectedEmployeeId && storeId ? <ManualAvailabilityBatchDialog
        key={`${storeId}:${manualTarget.employeeId}`} storeId={storeId} employeeId={manualTarget.employeeId} employeeName={manualTarget.employeeName} initialDate={anchorDate}
        timezone={timezone} weekStartsOn={weekStartsOn} workforceReady={workforceReady} onClose={() => setManualTarget(null)}
        onCommitted={(count) => { setManualTarget(null); setAvailabilityRefreshNonce((value) => value + 1);
          showToast({ tone: "success", title: "多日期可用时间已保存", description: `${manualTarget.employeeName} · 新增 ${count} 天` }); }} /> : null}
    </div>
  );
}

function FormalPositionBadges({ employee, jobByPositionId, prominent = false }: {
  employee: RosterEmployee;
  jobByPositionId: Map<string, RosterStoreJob>;
  prominent?: boolean;
}) {
  return <span className={`flex flex-wrap items-center gap-1.5 ${prominent ? "mt-3" : "mt-2"}`} aria-label="正式岗位">
    <span className="text-xs font-semibold text-graphite-600">正式岗位</span>
    {employee.positions?.length ? employee.positions.map((position) => {
      const job = jobByPositionId.get(position.id);
      const color = job && evaluateJobColor(job.colorToken);
      return <span key={position.id} className={`staff-role-tag${prominent ? " staff-role-tag--prominent" : ""}${color ? "" : " staff-role-tag--unmapped"}`}
        style={color ? roleColorStyle({ id: job!.id, code: job!.code ?? "", colorToken: color }) : undefined}>{position.name}</span>;
    }) : <span className="text-xs text-graphite-600">未确认</span>}
  </span>;
}

function cycleRange(anchor: string, days: number, weekStartsOn: number) {
  const { startDate } = weekRange(anchor, weekStartsOn);
  const dates = Array.from({ length: days }, (_, index) => addCalendarDays(startDate, index));
  return { from: dates[0]!, to: dates.at(-1)!, dates };
}
function availabilitySummary(rows: EmployeeAvailability[]) {
  const available = new Set(rows.filter((row) => row.status === "AVAILABLE").map((row) => row.date)).size;
  const unavailable = new Set(rows.filter((row) => row.status === "UNAVAILABLE").map((row) => row.date)).size;
  if (available) return { label: `${available} 天已提交可用时间`, tone: "text-emerald-700" };
  if (unavailable) return { label: `${unavailable} 天标记不可用`, tone: "text-amber-800" };
  return { label: "本周期可用时间未知", tone: "text-graphite-500" };
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }
