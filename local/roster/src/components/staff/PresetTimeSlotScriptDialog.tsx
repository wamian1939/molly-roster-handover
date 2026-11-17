import { ArrowRight, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../ui/Dialog";
import { InlineSpinner } from "../ui/ToastProvider";
import { rosterRepository, type PresetScriptInput, type PresetScriptPreview } from "../../services/rosterRepository";
import { buildPresetScriptInput, type ScriptEmployeeTarget } from "../../lib/presetScriptInput";
import { PresetScriptPreviewGroups } from "./PresetScriptPreviewGroups";
import { ApiRequestError } from "../../lib/apiClient";
import type { RosterEmployee } from "../../types/workforce";

export function PresetTimeSlotScriptDialog({ storeId, employees, employeeTarget = null, initialWeek = "NEXT", onWeekChange, onClose, onCommitted }: {
  storeId: string; employees: RosterEmployee[]; employeeTarget?: ScriptEmployeeTarget | null;
  initialWeek?: "CURRENT" | "NEXT"; onWeekChange?: (week: "CURRENT" | "NEXT") => void;
  onClose: () => void; onCommitted: (result: { alreadyImported: boolean; created: number; unchanged: number }) => void;
}) {
  const [activeTab, setActiveTab] = useState<"time" | "new">("time");
  const [week, setWeek] = useState<"CURRENT" | "NEXT">(initialWeek);
  const [script, setScript] = useState("");
  const [shortcutVersion, setShortcutVersion] = useState<number | undefined>();
  const [shortcutsSaved, setShortcutsSaved] = useState(false);
  const [loadingShortcuts, setLoadingShortcuts] = useState(true);
  const [shortcutLoadFailed, setShortcutLoadFailed] = useState(false);
  const [shortcutRetry, setShortcutRetry] = useState(0);
  const [preview, setPreview] = useState<PresetScriptPreview | null>(null);
  const [mappingNicknames, setMappingNicknames] = useState<string[]>([]);
  const [employeeMappings, setEmployeeMappings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let current = true;
    rosterRepository.presetShortcuts(storeId).then(({ configuration }) => {
      if (!current) return;
      setShortcutVersion(configuration?.version);
      setShortcutsSaved(Boolean(configuration));
      setShortcutLoadFailed(false);
    }).catch((cause) => { if (current) {
      setShortcutLoadFailed(true);
      setShortcutsSaved(false);
      setShortcutVersion(undefined);
      setError(`门店快捷码加载失败：${errorMessage(cause)}。请重新加载后再操作。`);
    } })
      .finally(() => { if (current) setLoadingShortcuts(false); });
    return () => { current = false; };
  }, [storeId, shortcutRetry]);

  function invalidate() { setPreview(null); setError(null); }
  function selectTab(tab: "time" | "new") {
    if (busyRef.current || tab === activeTab) return;
    setActiveTab(tab);
    setScript(""); setMappingNicknames([]); setEmployeeMappings({});
    setPreview(null); setError(null);
  }
  const input = (): PresetScriptInput => buildPresetScriptInput(storeId, week, script, employeeMappings, employeeTarget);
  async function convert() {
    if (busyRef.current || loadingShortcuts || shortcutLoadFailed || !shortcutsSaved) return;
    busyRef.current = true; setBusy(true); setError(null); setPreview(null);
    try {
      const { configuration } = await rosterRepository.presetShortcuts(storeId);
      if (configuration?.version !== shortcutVersion) {
        setShortcutVersion(configuration?.version);
        setShortcutsSaved(Boolean(configuration));
        setError("门店快捷码已变化，请核对设置中的当前时间并重新预览");
        return;
      }
      const result = await rosterRepository.previewPresetScript({ ...input(), expectedShortcutsVersion: shortcutVersion });
      if (employeeTarget && result.slots.some((slot) => slot.employeeId !== employeeTarget.id)) {
        throw new Error("预览包含其他员工，请关闭并重新打开此员工的脚本录入");
      }
      setPreview(result);
      if (!employeeTarget) setMappingNicknames((current) => [...new Set([...current, ...result.issues
        .filter((issue) => ["UNKNOWN_EMPLOYEE", "AMBIGUOUS_EMPLOYEE", "MAPPED_EMPLOYEE_MISSING", "EMPLOYEE_OUT_OF_SCOPE", "MAPPING_CONFLICT"].includes(issue.code))
        .map((issue) => issue.nickname).filter((nickname): nickname is string => Boolean(nickname))])]);
    }
    catch (cause) { setError(errorMessage(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function commit() {
    if (busyRef.current || shortcutLoadFailed || !preview?.canCommit || !shortcutsSaved) return;
    busyRef.current = true; setBusy(true); setError(null);
    const submission = { ...input(), previewHash: preview.previewHash,
      expectedSlotStatusHash: preview.slotStatusHash,
      expectedCreateCount: preview.summary.create, expectedUnchangedCount: preview.summary.unchanged };
    try {
      const saved = await rosterRepository.commitPresetScript(submission);
      onCommitted(saved);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 0) {
        // The first request may already have committed. The backend serializes
        // this exact source hash and returns the original audit on a retry.
        try {
          const recovered = await rosterRepository.commitPresetScript(submission);
          onCommitted(recovered);
          return;
        } catch {
          setError("导入结果仍未确认。请刷新员工可用时间核对；如已出现新增记录，请勿再次提交。脚本内容已保留，可重新预览。");
          setPreview(null);
          return;
        }
      }
      setError(errorMessage(cause)); setPreview(null);
    }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <Dialog titleId="preset-script-title" onClose={onClose} closeDisabled={busy}
    className="preset-script-dialog relative overflow-y-auto rounded-[20px] bg-white shadow-lift">
    <header className="preset-script-header flex items-start justify-between border-b border-graphite-200 px-5 py-4 sm:px-6">
      <div><p className="sr-only">Staff · Availability</p>
        <h2 id="preset-script-title" className="mt-1 text-xl font-semibold text-graphite-950">{employeeTarget ? `Script Record Time · ${employeeTarget.displayName}` : "Preset Time Slot Script"}</h2></div>
      <button type="button" aria-label="关闭脚本导入" disabled={busy} onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-graphite-100"><X className="h-4 w-4" /></button>
    </header>
    {!employeeTarget ? <nav className="preset-script-tabs" role="tablist" aria-label="脚本操作">
      {([ ["time", "Time Slot Script"], ["new", "New: Time Slot Script"] ] as const).map(([id, label]) =>
        <button key={id} type="button" role="tab" aria-selected={activeTab === id} disabled={busy}
          className="preset-script-tab" onClick={() => selectTab(id)}>{label}</button>)}
    </nav> : null}
    <div className="preset-script-layout grid" role="tabpanel">
      <section className="preset-script-source min-w-0">
        <h3 className="text-sm font-semibold text-graphite-950">{activeTab === "new" ? "New: Time Slot Script" : "Time Slot Script"}</h3>
        <div className="preset-script-week mt-3" aria-label="脚本目标周">
          <span className={week === "CURRENT" ? "preset-script-week-active" : ""}>This Week</span>
          <button type="button" role="switch" aria-label="Next Week" aria-checked={week === "NEXT"}
            disabled={busy} className="preset-script-week-switch"
            onClick={() => { const nextWeek = week === "NEXT" ? "CURRENT" : "NEXT"; setWeek(nextWeek); onWeekChange?.(nextWeek); invalidate(); }}>
            <span aria-hidden="true" className="preset-script-week-thumb" />
          </button>
          <span className={week === "NEXT" ? "preset-script-week-active" : ""}>Next Week</span>
        </div>
        <label className="mt-3 block text-xs font-semibold text-graphite-700" htmlFor="preset-script-text">{employeeTarget ? "星期与快捷码" : "Script"}</label>
        {activeTab === "new" ? <p className="mt-1 text-xs text-graphite-600">输入员工姓名和代码；例如 HandoverEmployee006 1AA2AA34567AA，姓名唯一时也可写 Berlin1AA2AA34567AA。姓名重名时需在预览中明确选择员工。</p> : null}
        {employeeTarget ? <input id="preset-script-text" value={script} onChange={(event) => { setScript(event.target.value); invalidate(); }}
          disabled={busy || shortcutLoadFailed} className="native-input mt-1 w-full" spellCheck={false} placeholder="1AA 2BB 或 1-5AA" />
          : <textarea id="preset-script-text" value={script} onChange={(event) => { setScript(event.target.value); setMappingNicknames([]); setEmployeeMappings({}); invalidate(); }}
            disabled={busy || shortcutLoadFailed} className="native-input preset-script-editor mt-1 w-full resize-y" spellCheck={false}
            placeholder={activeTab === "new" ? "HandoverEmployee006 1AA2AA34567AA\nCindy 1234567AA" : "员工姓名\t1AA 2BB\n另一位员工\t1-5AA"} />}
        {employeeTarget ? <p className="mt-2 text-xs text-graphite-600">仅为 {employeeTarget.displayName} 预览和追加；提交时会重新核对 Evaluate 员工身份、门店和在职状态。</p> : null}
        {!employeeTarget && mappingNicknames.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-950">确认脚本姓名对应的 Evaluate 员工</p>
          <p className="mt-1 text-xs text-amber-900">仅用于本次导入；未唯一匹配前不能提交。员工资格在预览和提交时重新核对。</p>
          <div className="mt-3 space-y-2">{mappingNicknames.map((nickname) => <label key={nickname} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:items-center">
            <span className="min-w-0 truncate font-medium text-amber-950">{nickname}</span>
            <select aria-label={`${nickname} 对应员工`} className="native-input min-w-0" value={employeeMappings[nickname] ?? ""} disabled={busy}
              onChange={(event) => { setEmployeeMappings((current) => ({ ...current, [nickname]: event.target.value })); invalidate(); }}>
              <option value="">请选择当前门店员工</option>
              {mappingChoices(employees, storeId, nickname).map((employee, _, choices) => <option key={employee.id} value={employee.id}>{mappingChoiceLabel(employee, choices)}</option>)}
            </select>
          </label>)}</div>
        </div> : null}
        {shortcutLoadFailed ? <button type="button" className="calendar-text-button mt-4" disabled={busy || loadingShortcuts}
          onClick={() => { setLoadingShortcuts(true); setShortcutLoadFailed(false); setError(null); setShortcutRetry((current) => current + 1); }}>重新加载快捷码</button> : null}
        {!loadingShortcuts && !shortcutLoadFailed && !shortcutsSaved ? <p className="mt-4 text-sm text-amber-800">请先到<Link className="mx-1 underline" to="/settings" onClick={onClose}>设置</Link>核对并保存本门店快捷码。</p> : null}
      </section>
      <><div className="preset-script-actions flex items-center justify-center gap-3">
        <button type="button" aria-label="转换脚本预览" title="转换脚本预览" onClick={() => void convert()} disabled={busy || loadingShortcuts || shortcutLoadFailed || !script.trim() || !shortcutsSaved} className="calendar-primary-button h-11 w-11 p-0"><ArrowRight className="h-4 w-4" /></button>
        <button type="button" aria-label="清空脚本" title="清空脚本" onClick={() => { setScript(""); setMappingNicknames([]); setEmployeeMappings({}); invalidate(); }} disabled={busy || !script} className="calendar-text-button h-11 w-11 p-0"><Trash2 className="h-4 w-4" /></button>
      </div>
      <section className="preset-script-preview min-w-0"><h3 className="text-sm font-semibold text-graphite-950">Time Slot - Append</h3>
        {!preview ? <p className="mt-4 rounded-xl border border-dashed border-graphite-300 p-5 text-sm text-graphite-600">转换后将在这里显示每位员工的日期、时间和冲突。</p> : <>
          <p className="mt-2 text-sm text-graphite-700">目标周：{preview.weekStart} · {preview.timezone}</p>
          <p className="mt-2 text-sm font-semibold text-graphite-950">候选新增 {preview.summary.create} · 不变 {preview.summary.unchanged} · 冲突 {preview.summary.conflict}</p>
          {!preview.canCommit && (preview.summary.conflict > 0 || preview.issues.length > 0)
            ? <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="status">存在冲突或错误，本次导入不会写入任何记录；请修正脚本后重新转换。</p> : null}
          <div className="preset-script-preview-slots mt-3 overflow-y-auto" tabIndex={0} role="region" aria-label="员工时段预览">
            <PresetScriptPreviewGroups slots={preview.slots} timezone={preview.timezone} />
            {!preview.slots.length ? <p className="p-3 text-sm text-graphite-600">暂无可预览的时段，请核对脚本和下方提示。</p> : null}
          {preview.issues.length ? <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800">{preview.issues.map((issue, index) => <li key={index}>{issue.line ? `第 ${issue.line} 行：` : ""}{issue.message}</li>)}</ul> : null}
          </div>
        </>}
      </section></>
    </div>
    {error ? <p role="alert" className="mx-5 mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:mx-6">{error}</p> : null}
    <footer className="preset-script-footer flex justify-end gap-3 border-t border-graphite-200 px-5 py-4 sm:px-6">
      <button type="button" className="calendar-text-button" disabled={busy} onClick={onClose}>取消</button>
      <button type="button" className="calendar-primary-button" disabled={busy || shortcutLoadFailed || !preview?.canCommit || !shortcutsSaved} onClick={() => void commit()}>{busy ? <InlineSpinner /> : null}{preview && !preview.canCommit && (preview.summary.conflict > 0 || preview.issues.length > 0)
        ? "请先修正冲突" : preview && !preview.canCommit && preview.summary.create === 0 ? "没有可追加记录" : `确认追加 ${preview?.summary.create ?? 0} 条`}</button>
    </footer>
  </Dialog>;
}

function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : "脚本处理失败，请重试"; }
function mappingChoices(employees: RosterEmployee[], storeId: string, nickname: string) {
  const active = employees.filter((employee) => employee.isActive && employee.storeId === storeId);
  const named = employees.filter((employee) => normalizedEmployeeName(employee.displayName) === normalizedEmployeeName(nickname));
  return named.length ? named.filter((employee) => employee.isActive && employee.storeId === storeId) : active;
}
function normalizedEmployeeName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU"); }
function mappingChoiceLabel(employee: RosterEmployee, choices: RosterEmployee[]) {
  return choices.filter((candidate) => normalizedEmployeeName(candidate.displayName) === normalizedEmployeeName(employee.displayName)).length > 1
    ? `${employee.displayName} · ${employee.id}` : employee.displayName;
}
