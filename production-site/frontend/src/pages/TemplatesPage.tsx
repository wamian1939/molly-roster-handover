import { CalendarClock, Clock3, Layers3, Pencil, Plus, Power } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AppSelect } from "../components/ui/AppSelect";
import { InlineSpinner, useToast } from "../components/ui/ToastProvider";
import { breakMinuteOptions } from "../lib/breakMinuteOptions";
import { checkedAvailabilityTemplates, checkedSavedAvailabilityTemplate, checkedSavedShiftTemplate, checkedShiftTemplates, TemplateMutationResponseError } from "../lib/templateResponses";
import { verifiedShiftRoles } from "../lib/verifiedShiftRoles";
import { rosterRepository } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import { useStoreSelection } from "../store/StoreContext";
import type { AvailabilityTemplate, ShiftRole, ShiftTemplate } from "../types/roster";
import type { RosterStore } from "../types/workforce";

const emptyForm = { name: "", startTime: "09:00", endTime: "22:00", breakMinutes: 0, shiftRoleId: "" };

export function TemplatesPage() {
  const { user } = useAuth(); const { showToast } = useToast();
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  const [stores, setStores] = useState<RosterStore[]>([]); const storeId = selectedStoreId;
  const [roles, setRoles] = useState<ShiftRole[]>([]); const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [availabilityTemplates, setAvailabilityTemplates] = useState<AvailabilityTemplate[]>([]); const [availabilityName, setAvailabilityName] = useState(""); const [availabilityPattern, setAvailabilityPattern] = useState("ALL_DAY");
  const [form, setForm] = useState(emptyForm); const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [pendingStoreIds, setPendingStoreIds] = useState<Set<string>>(() => new Set());
  const activeStoreRef = useRef(storeId);
  useLayoutEffect(() => { activeStoreRef.current = storeId; }, [storeId]);
  const scopeRevisionRef = useRef(0);
  const shiftLoadGenerationRef = useRef(0);
  const availabilityLoadGenerationRef = useRef(0);
  const pendingStoresRef = useRef(new Set<string>());
  const [loadedStoreId, setLoadedStoreId] = useState("");
  const [loadedAvailabilityStoreId, setLoadedAvailabilityStoreId] = useState("");
  const storeReady = Boolean(storeId) && loadedStoreId === storeId;
  const availabilityReady = Boolean(storeId) && loadedAvailabilityStoreId === storeId;
  const saving = pendingStoreIds.has(storeId);
  const invalidSelectedRole = Boolean(form.shiftRoleId && !roles.some((role) => role.id === form.shiftRoleId));

  useEffect(() => { let active = true; workforceRepository.stores().then((result) => { if (!active) return; setStores(result.stores); initializeStoreId(result.stores.map((store) => store.id)); }).catch((cause) => { if (active) showToast({ tone: "error", title: "门店加载失败", description: msg(cause) }); }); return () => { active = false; }; }, [initializeStoreId, showToast]);
  // Store-owned form data must be cleared before the next store can be edited.
  useEffect(() => {
    scopeRevisionRef.current += 1;
    const shiftGeneration = ++shiftLoadGenerationRef.current;
    const availabilityGeneration = ++availabilityLoadGenerationRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedStoreId(""); setLoadedAvailabilityStoreId(""); setRoles([]); setTemplates([]); setAvailabilityTemplates([]);
    setEditing(null); setForm(emptyForm); setAvailabilityName("");
    if (!storeId) return;
    let active = true;
    Promise.all([rosterRepository.roles(storeId), rosterRepository.templates(storeId), workforceRepository.jobs(storeId)])
      .then(([nextRoles, nextTemplates, jobs]) => {
        if (!active || activeStoreRef.current !== storeId || shiftLoadGenerationRef.current !== shiftGeneration) return;
        const checked = checkedShiftTemplates(nextTemplates, storeId);
        setRoles(verifiedShiftRoles(nextRoles, jobs.jobs, storeId)); setTemplates(checked); setLoadedStoreId(storeId);
      })
      .catch((cause) => { if (active && activeStoreRef.current === storeId && shiftLoadGenerationRef.current === shiftGeneration) showToast({ tone: "error", title: "班次模板加载失败", description: msg(cause) }); });
    rosterRepository.availabilityTemplates(storeId).then((nextAvailability) => {
      if (!active || activeStoreRef.current !== storeId || availabilityLoadGenerationRef.current !== availabilityGeneration) return;
      setAvailabilityTemplates(checkedAvailabilityTemplates(nextAvailability, storeId)); setLoadedAvailabilityStoreId(storeId);
    }).catch((cause) => { if (active && activeStoreRef.current === storeId && availabilityLoadGenerationRef.current === availabilityGeneration) showToast({ tone: "error", title: "可用时间模板加载失败", description: msg(cause) }); });
    return () => { active = false; };
  }, [showToast, storeId]);

  function beginEdit(template: ShiftTemplate) {
    if (!storeReady || pendingStoresRef.current.has(storeId) || template.storeId !== storeId) return;
    setEditing(template);
    setForm({ name: template.name, startTime: template.startTime, endTime: template.endTime,
      breakMinutes: template.breakMinutes, shiftRoleId: template.shiftRoleId ?? "" });
  }
  function cancelEdit() {
    if (pendingStoresRef.current.has(storeId)) return;
    setEditing(null); setForm(emptyForm);
  }
  function beginMutation(kind: "shift" | "availability" = "shift") {
    if (!(kind === "shift" ? storeReady : availabilityReady) || activeStoreRef.current !== storeId || pendingStoresRef.current.has(storeId)) return false;
    pendingStoresRef.current.add(storeId); setPendingStoreIds(new Set(pendingStoresRef.current));
    return true;
  }
  function finishMutation(mutationStoreId: string) {
    pendingStoresRef.current.delete(mutationStoreId);
    setPendingStoreIds(new Set(pendingStoresRef.current));
  }
  function sameScope(revision: number) { return activeStoreRef.current === storeId && scopeRevisionRef.current === revision; }
  async function reload(revision: number) {
    const result = await rosterRepository.templates(storeId);
    if (sameScope(revision)) setTemplates(checkedShiftTemplates(result, storeId));
  }
  async function reloadAvailability(revision: number) {
    const result = await rosterRepository.availabilityTemplates(storeId);
    if (sameScope(revision)) setAvailabilityTemplates(checkedAvailabilityTemplates(result, storeId));
  }
  async function refreshAfterMutation(revision: number, refresh: () => Promise<void>, title: string) {
    try { await refresh(); }
    catch (cause) { if (sameScope(revision)) showToast({ tone: "error", title, description: msg(cause) }); }
  }
  async function refreshIfReturned(revision: number, title: string, kind: "shift" | "availability") {
    if (activeStoreRef.current !== storeId || scopeRevisionRef.current === revision) return;
    const currentRevision = scopeRevisionRef.current;
    if (kind === "shift") {
      const loadGeneration = ++shiftLoadGenerationRef.current;
      setLoadedStoreId("");
      try {
        const [nextRoles, nextTemplates, jobs] = await Promise.all([rosterRepository.roles(storeId), rosterRepository.templates(storeId), workforceRepository.jobs(storeId)]);
        if (!sameScope(currentRevision) || shiftLoadGenerationRef.current !== loadGeneration) return;
        const checked = checkedShiftTemplates(nextTemplates, storeId);
        setRoles(verifiedShiftRoles(nextRoles, jobs.jobs, storeId));
        setTemplates(checked); setLoadedStoreId(storeId);
      } catch (cause) {
        if (sameScope(currentRevision) && shiftLoadGenerationRef.current === loadGeneration) showToast({ tone: "error", title, description: msg(cause) });
      }
      return;
    }
    const loadGeneration = ++availabilityLoadGenerationRef.current;
    setLoadedAvailabilityStoreId("");
    try {
      const nextAvailability = await rosterRepository.availabilityTemplates(storeId);
      if (!sameScope(currentRevision) || availabilityLoadGenerationRef.current !== loadGeneration) return;
      setAvailabilityTemplates(checkedAvailabilityTemplates(nextAvailability, storeId)); setLoadedAvailabilityStoreId(storeId);
    } catch (cause) {
      if (sameScope(currentRevision) && availabilityLoadGenerationRef.current === loadGeneration) showToast({ tone: "error", title, description: msg(cause) });
    }
  }
  async function save() {
    if (invalidSelectedRole || (editing && editing.storeId !== storeId) || !beginMutation()) return;
    const revision = scopeRevisionRef.current;
    try {
      const submitted = editing
        ? { storeId, ...form, shiftRoleId: form.shiftRoleId || null, id: editing.id, isActive: editing.isActive, displayOrder: editing.displayOrder, version: editing.version }
        : { storeId, ...form, shiftRoleId: form.shiftRoleId || null };
      const response = editing
        ? await rosterRepository.updateTemplate(editing.id, { storeId, ...form, shiftRoleId: form.shiftRoleId || null, isActive: editing.isActive, displayOrder: editing.displayOrder, version: editing.version })
        : await rosterRepository.createTemplate({ storeId, ...form, shiftRoleId: form.shiftRoleId || null });
      const saved = checkedSavedShiftTemplate(response, submitted);
      if (sameScope(revision)) {
        setTemplates((current) => editing
          ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
        showToast({ tone: "success", title: editing ? "模板已更新" : "模板已创建" });
        setEditing(null); setForm(emptyForm);
        await refreshAfterMutation(revision, () => reload(revision), "模板已保存，列表刷新失败");
      }
      await refreshIfReturned(revision, "模板已保存，列表刷新失败", "shift");
    } catch (cause) { if (sameScope(revision)) showToast({ tone: "error", title: cause instanceof TemplateMutationResponseError ? "保存结果未确认" : "保存失败", description: msg(cause) }); }
    finally { finishMutation(storeId); }
  }
  async function toggle(template: ShiftTemplate) {
    if (template.storeId !== storeId || !beginMutation()) return;
    const revision = scopeRevisionRef.current;
    try {
      const submitted = { storeId, id: template.id, name: template.name, startTime: template.startTime, endTime: template.endTime, breakMinutes: template.breakMinutes, shiftRoleId: template.shiftRoleId, isActive: !template.isActive, displayOrder: template.displayOrder, version: template.version };
      const response = await rosterRepository.updateTemplate(template.id, submitted);
      const saved = checkedSavedShiftTemplate(response, submitted);
      if (sameScope(revision)) {
        setTemplates((current) => current.map((item) => item.id === saved.id ? saved : item));
        await refreshAfterMutation(revision, () => reload(revision), "模板已更新，列表刷新失败");
      }
      await refreshIfReturned(revision, "模板已更新，列表刷新失败", "shift");
    } catch (cause) { if (sameScope(revision)) showToast({ tone: "error", title: cause instanceof TemplateMutationResponseError ? "保存结果未确认" : "更新失败", description: msg(cause) }); }
    finally { finishMutation(storeId); }
  }
  async function createAvailabilityTemplate() {
    if (!beginMutation("availability")) return;
    const revision = scopeRevisionRef.current;
    try {
      const time = availabilityPattern === "EVENING" ? ["16:00", "22:00"] : ["09:00", "22:00"];
      const status = availabilityPattern === "UNKNOWN" ? "UNKNOWN" as const : "AVAILABLE" as const;
      const submitted = { storeId, name: availabilityName, slots: Array.from({ length: 7 }, (_, dayOffset) => ({ dayOffset, status, startTime: status === "UNKNOWN" ? null : time[0]!, endTime: status === "UNKNOWN" ? null : time[1]! })) };
      const response = await rosterRepository.createAvailabilityTemplate(submitted);
      const saved = checkedSavedAvailabilityTemplate(response, submitted);
      if (sameScope(revision)) {
        setAvailabilityName("");
        setAvailabilityTemplates((current) => [saved, ...current]);
        showToast({ tone: "success", title: "可用时间模板已创建" });
        await refreshAfterMutation(revision, () => reloadAvailability(revision), "可用时间模板已保存，列表刷新失败");
      }
      await refreshIfReturned(revision, "可用时间模板已保存，列表刷新失败", "availability");
    } catch (cause) { if (sameScope(revision)) showToast({ tone: "error", title: cause instanceof TemplateMutationResponseError ? "保存结果未确认" : "保存失败", description: msg(cause) }); }
    finally { finishMutation(storeId); }
  }
  async function toggleAvailability(template: AvailabilityTemplate) {
    if (template.storeId !== storeId || !beginMutation("availability")) return;
    const revision = scopeRevisionRef.current;
    try {
      const submitted = { storeId, id: template.id, name: template.name, slots: template.slots, isActive: !template.isActive, displayOrder: template.displayOrder, version: template.version };
      const response = await rosterRepository.updateAvailabilityTemplate(template.id, submitted);
      const saved = checkedSavedAvailabilityTemplate(response, submitted);
      if (sameScope(revision)) {
        setAvailabilityTemplates((current) => current.map((item) => item.id === saved.id ? saved : item));
        await refreshAfterMutation(revision, () => reloadAvailability(revision), "可用时间模板已更新，列表刷新失败");
      }
      await refreshIfReturned(revision, "可用时间模板已更新，列表刷新失败", "availability");
    } catch (cause) { if (sameScope(revision)) showToast({ tone: "error", title: cause instanceof TemplateMutationResponseError ? "保存结果未确认" : "更新失败", description: msg(cause) }); }
    finally { finishMutation(storeId); }
  }

  return <div><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-700">常用班次预设</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-graphite-950 sm:text-3xl">排班模板</h1><p className="mt-2 text-sm text-graphite-600">模板只预填时间、休息和岗位，员工仍在每次排班时确认。</p></div>{(user?.role === "ADMIN" || (user?.storeIds.length ?? 0) > 1) ? <div className="min-w-52"><AppSelect label="门店" value={selectedStoreId} onValueChange={setSelectedStoreId} options={stores.map((store) => ({ value: store.id, label: store.name }))} /></div> : null}</header>
    <div className="mt-6 grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]"><section className="rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel"><h2 className="text-base font-semibold text-graphite-950">{editing ? "编辑模板" : "新增模板"}</h2><fieldset disabled={!storeReady || saving} className="mt-4 space-y-4"><Field label="模板名称"><input className="native-input" value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：早班" /></Field><div className="grid grid-cols-2 gap-3"><Field label="开始"><input className="native-input" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></Field><Field label="结束"><input className="native-input" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></Field></div><AppSelect label="休息" value={String(form.breakMinutes)} onValueChange={(value) => setForm({ ...form, breakMinutes: Number(value) })} options={breakMinuteOptions(form.breakMinutes).map((value) => ({ value: String(value), label: value ? `${value} 分钟` : "不休息" }))} /><AppSelect label="默认岗位" value={form.shiftRoleId || "NONE"} onValueChange={(value) => setForm({ ...form, shiftRoleId: value === "NONE" ? "" : value })} options={[{ value: "NONE", label: "不指定岗位" }, ...roles.map((role) => ({ value: role.id, label: role.nameZh }))]} /></fieldset>{invalidSelectedRole ? <p className="mt-3 text-sm text-amber-800" role="alert">此模板使用的旧岗位已不在 Evaluate 正式清单中。请选择当前岗位或不指定岗位。</p> : null}<div className="mt-5 flex gap-2">{editing ? <button type="button" className="calendar-text-button" disabled={saving} onClick={cancelEdit}>取消</button> : null}<button type="button" className="calendar-primary-button flex-1" disabled={saving || !storeReady || invalidSelectedRole || !form.name.trim()} onClick={() => void save()}>{saving ? <InlineSpinner /> : <Plus className="h-4 w-4" />}{editing ? "保存修改" : "创建模板"}</button></div></section>
      <section className="rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-brand-700" /><h2 className="font-semibold text-graphite-950">当前模板</h2></div><div className="mt-4 grid gap-3 md:grid-cols-2">{(storeReady ? templates : []).map((template) => <article key={template.id} className="rounded-2xl border border-graphite-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-graphite-950">{template.name}</h3><p className="mt-2 flex items-center gap-1.5 text-sm text-graphite-600"><Clock3 className="h-4 w-4" />{template.startTime}–{template.endTime} · 休息 {template.breakMinutes} 分钟</p><p className="mt-2 text-xs font-semibold text-brand-700">{template.shiftRoleId && !roles.some((role) => role.id === template.shiftRoleId) ? `旧岗位：${template.shiftRole?.nameZh ?? "未知"} · 需重新关联` : roles.find((role) => role.id === template.shiftRoleId)?.nameZh ?? "不指定岗位"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${template.isActive ? "bg-emerald-50 text-emerald-700" : "bg-graphite-100 text-graphite-500"}`}>{template.isActive ? "启用" : "停用"}</span></div><div className="mt-4 flex gap-2"><button type="button" className="calendar-text-button" disabled={saving || !storeReady} onClick={() => beginEdit(template)}><Pencil className="h-4 w-4" />编辑</button><button type="button" className="calendar-text-button" disabled={saving || !storeReady} onClick={() => void toggle(template)}><Power className="h-4 w-4" />{template.isActive ? "停用" : "启用"}</button></div></article>)}{storeReady && !templates.length ? <div className="col-span-full rounded-2xl border border-dashed border-graphite-300 p-10 text-center text-sm text-graphite-500">尚无门店模板。创建后会出现在新增班次弹窗。</div> : null}</div></section></div>
    <section className="mt-5 min-w-0 rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-brand-700" /><h2 className="font-semibold text-graphite-950">可用时间模板</h2></div><fieldset disabled={!availabilityReady || saving} className="mt-4 flex min-w-0 flex-wrap items-end gap-3"><label className="min-w-0 flex-[1_1_13rem]"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">模板名称</span><input className="native-input" value={availabilityName} onChange={(event) => setAvailabilityName(event.target.value)} placeholder="例如：标准全天" /></label><div className="w-full sm:w-44"><AppSelect label="一周模式" value={availabilityPattern} onValueChange={setAvailabilityPattern} options={[{ value: "ALL_DAY", label: "每天 09–22 可用" }, { value: "EVENING", label: "每天 16–22 可用" }, { value: "UNKNOWN", label: "每天未知" }]} /></div><button type="button" className="calendar-primary-button w-full sm:w-auto" disabled={saving || !availabilityReady || !availabilityName.trim()} onClick={() => void createAvailabilityTemplate()}><Plus className="h-4 w-4" />创建模板</button></fieldset><p className="mt-3 text-xs text-graphite-500">复杂的多时段模板可在员工页配置后保存；这里提供常用的一键模板。</p><div className="mt-4 flex min-w-0 flex-wrap gap-3">{(availabilityReady ? availabilityTemplates : []).map((template) => <article key={template.id} className="min-w-0 flex-[1_1_14rem] rounded-xl border border-graphite-200 p-3"><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-graphite-950">{template.name}</strong><p className="mt-1 text-xs text-graphite-500">{new Set(template.slots.map((slot) => slot.dayOffset)).size} 天 · {template.slots.filter((slot) => slot.status !== "UNKNOWN").length} 个时段 · {template.isActive ? "启用" : "停用"}</p></div><button type="button" className="calendar-text-button shrink-0" disabled={saving || !availabilityReady} onClick={() => void toggleAvailability(template)}>{template.isActive ? "停用" : "启用"}</button></div></article>)}</div></section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">{label}</span>{children}</label>; }
function msg(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }
