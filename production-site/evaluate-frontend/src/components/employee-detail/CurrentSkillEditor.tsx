import { useEffect, useState } from "react";
import { skillStatusLabels } from "../evaluation-v1/skillPresentation";
import { Dialog } from "../ui/Dialog";
import { employeeRepository, type CurrentSkillConfirmation, type CurrentSkillDefinition } from "../../services/employeeRepository";
import type { SkillPresentationStatus } from "../../types/evaluation";

const progressiveStatuses: SkillPresentationStatus[] = ["Unknown", "NotTrained", "Training", "Independent", "Proficient"];
const binaryStatuses: SkillPresentationStatus[] = ["Unknown", "CannotDo", "CanDo"];

export function CurrentSkillEditor({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [skills, setSkills] = useState<CurrentSkillDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<SkillPresentationStatus>("Unknown");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CurrentSkillConfirmation[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReload, setHistoryReload] = useState(0);
  const selected = skills.find((skill) => skill.id === selectedId);

  useEffect(() => {
    let active = true;
    employeeRepository.fetchCurrentSkills(employeeId).then(({ skills: loaded }) => {
      if (!active) return;
      setSkills(loaded);
      setSelectedId(loaded[0]?.id ?? "");
      setStatus(loaded[0]?.status ?? "Unknown");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "无法读取当前技能。");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    employeeRepository.fetchCurrentSkillConfirmations(employeeId, selectedId, historyPage).then((result) => {
      if (!active) return;
      setHistory(result.items);
      setHistoryTotalPages(result.totalPages);
    }).catch(() => {
      if (active) setHistoryError("无法读取确认记录，请重试。");
    }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [employeeId, selectedId, historyPage, historyReload]);

  async function save() {
    if (!selected || reason.trim().length < 3 || reason.trim().length > 500) return;
    setSaving(true);
    setError(null);
    try {
      await employeeRepository.confirmCurrentSkill(employeeId, selected, status, reason.trim());
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认当前技能失败，请刷新后重试。");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog titleId="current-skill-editor-title" onClose={onClose} closeDisabled={saving} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
    <div className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 id="current-skill-editor-title" className="text-xl font-semibold text-graphite-950">确认当前技能</h2>
        <p className="mt-1 text-sm text-graphite-600">此处是官方当前状态。个人评分和已结束轮次的历史快照保持不变。</p>
      </div>
      {loading ? <p role="status" className="text-sm text-graphite-600">正在读取技能…</p> : null}
      {!loading && skills.length === 0 ? <p className="text-sm text-graphite-600">当前没有可维护的技能定义。</p> : null}
      {selected ? <>
        <label className="block text-sm font-semibold text-graphite-800">技能
          <select className="native-input mt-1.5" value={selectedId} onChange={(event) => {
            const next = skills.find((skill) => skill.id === event.target.value);
            setSelectedId(next?.id ?? "");
            setStatus(next?.status ?? "Unknown");
            setReason("");
            setHistoryPage(1);
            setError(null);
          }}>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.nameZh}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-graphite-800">官方状态
          <select className="native-input mt-1.5" value={status} onChange={(event) => setStatus(event.target.value as SkillPresentationStatus)}>
            {(selected.skillMode === "BINARY" ? binaryStatuses : progressiveStatuses).map((value) => <option key={value} value={value}>{skillStatusLabels[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-graphite-800">确认依据
          <textarea className="native-input mt-1.5 min-h-24 w-full resize-y" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required aria-describedby="current-skill-reason-help" placeholder="例如：门店经理现场复核" />
        </label>
        <p id="current-skill-reason-help" className="text-xs leading-5 text-graphite-600">请写明依据（3–500 字）。即使状态未变也可确认；系统会记录管理员、原状态、确认状态和时间。历史评价快照不受影响。</p>
        <section aria-labelledby="current-skill-history-title" className="border-t border-graphite-200 pt-4">
          <h3 id="current-skill-history-title" className="text-sm font-semibold text-graphite-900">最近确认记录</h3>
          {historyLoading ? <p role="status" className="mt-2 text-sm text-graphite-600">正在读取确认记录…</p> : null}
          {historyError ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-700"><p role="alert">{historyError}</p><button type="button" className="font-semibold underline underline-offset-2" onClick={() => setHistoryReload((value) => value + 1)}>重试</button></div> : null}
          {!historyLoading && !historyError && history.length === 0 ? <p className="mt-2 text-sm leading-5 text-graphite-600">暂无管理员确认记录；旧状态的来源可能未完整留痕。</p> : null}
          {!historyLoading && !historyError && history.length > 0 ? <ol className="mt-2 space-y-3">
            {history.map((item) => <li key={item.id} className="border-t border-graphite-200 pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-semibold text-graphite-900">{item.previousStatus ? skillStatusLabels[item.previousStatus] : "未记录"} → {skillStatusLabels[item.confirmedStatus]}</p>
              <p className="mt-0.5 text-xs text-graphite-600">{item.confirmedByName} · <time dateTime={item.confirmedAt}>{new Date(item.confirmedAt).toLocaleString("zh-CN")}</time></p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-graphite-700">{item.reason ?? "未记录依据"}</p>
            </li>)}
          </ol> : null}
          {!historyLoading && !historyError && historyTotalPages > 1 ? <div className="mt-3 flex items-center justify-end gap-3 text-xs text-graphite-700">
            <button type="button" className="min-h-11 font-semibold disabled:opacity-40" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}>上一页</button>
            <span>{historyPage} / {historyTotalPages}</span>
            <button type="button" className="min-h-11 font-semibold disabled:opacity-40" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((value) => value + 1)}>下一页</button>
          </div> : null}
        </section>
      </> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-graphite-300 px-4 py-2 text-sm font-semibold text-graphite-800 hover:bg-graphite-50" onClick={onClose} disabled={saving}>取消</button>
        <button type="button" className="min-h-11 rounded-lg bg-graphite-950 px-4 py-2 text-sm font-semibold text-white hover:bg-graphite-800 disabled:opacity-50" onClick={() => void save()} disabled={loading || saving || !selected || reason.trim().length < 3}>{saving ? "正在确认…" : "确认当前技能"}</button>
      </div>
    </div>
  </Dialog>;
}
