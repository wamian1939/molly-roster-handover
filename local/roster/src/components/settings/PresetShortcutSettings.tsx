import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rosterRepository, type PresetScriptShortcut } from "../../services/rosterRepository";

const referenceShortcuts: PresetScriptShortcut[] = [
  { code: "AA", startTime: "10:00", endTime: "22:00" },
  { code: "BB", startTime: "10:00", endTime: "17:00" },
  { code: "CC", startTime: "16:00", endTime: "22:00" },
];

export function PresetShortcutSettings({ storeId }: { storeId: string }) {
  const [shortcuts, setShortcuts] = useState<PresetScriptShortcut[]>(referenceShortcuts);
  const [version, setVersion] = useState<number | undefined>();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const mutationLock = useRef(false);

  useEffect(() => {
    let current = true;
    rosterRepository.presetShortcuts(storeId).then(({ configuration }) => {
      if (!current) return;
      setShortcuts(configuration?.shortcuts ?? referenceShortcuts);
      setVersion(configuration?.version);
      setSaved(Boolean(configuration));
      setDirty(false);
      setConfirmed(false);
      setError(null);
    }).catch((cause) => {
      if (current) setError(`门店快捷码加载失败：${message(cause)}`);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [storeId, retry]);

  function patch(index: number, change: Partial<PresetScriptShortcut>) {
    setShortcuts((current) => current.map((item, position) => position === index ? { ...item, ...change } : item));
    setDirty(true); setConfirmed(false); setError(null);
  }
  async function save() {
    if (mutationLock.current || loading || saving || !confirmed || (saved && !dirty)) return;
    mutationLock.current = true; setSaving(true); setError(null);
    try {
      const result = await rosterRepository.savePresetShortcuts({ storeId, shortcuts, version });
      setShortcuts(result.shortcuts); setVersion(result.version);
      setSaved(true); setDirty(false); setConfirmed(false);
    } catch (cause) { setError(`快捷码保存失败：${message(cause)}`); }
    finally { mutationLock.current = false; setSaving(false); }
  }
  function reload() { if (saving) return; setLoading(true); setError(null); setRetry((current) => current + 1); }

  return <section className="mt-5 min-w-0 rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel sm:p-6" aria-label="可用时间快捷码设置">
    <h2 className="text-base font-semibold text-graphite-950">可用时间快捷码</h2>
    <p className="mt-1 text-sm text-graphite-600">为当前门店设置脚本中的快捷码和对应时段。保存后，员工可用时间脚本会使用这些时间。</p>
    <p className="mt-2 text-xs text-graphite-600">{saved ? `当前版本 ${version}` : "下方时间来自 Hurstville 参考界面，请按当前门店核对后保存。"} 结束时间早于开始时间表示次日，最长 24 小时。</p>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {error ? <button type="button" className="calendar-text-button mt-3" disabled={loading || saving} onClick={reload}>重新加载快捷码</button> : null}
    <fieldset disabled={loading || saving || Boolean(error && !dirty)}>
      <div className="mt-4 space-y-2 overflow-x-auto">{shortcuts.map((shortcut, index) => <div key={index} className="grid min-w-[420px] grid-cols-[minmax(4rem,1fr)_minmax(7rem,1.5fr)_auto_minmax(7rem,1.5fr)_2.25rem] items-center gap-2">
        <input aria-label={`快捷码 ${index + 1}`} title="最多 20 个英文字母" maxLength={20} className="native-input min-w-0" value={shortcut.code} onChange={(event) => patch(index, { code: event.target.value.toUpperCase() })} />
        <input aria-label={`开始时间 ${index + 1}`} type="time" className="native-input min-w-0" value={shortcut.startTime} onChange={(event) => patch(index, { startTime: event.target.value })} />
        <span aria-hidden="true">~</span>
        <input aria-label={`结束时间 ${index + 1}`} type="time" className="native-input min-w-0" value={shortcut.endTime} onChange={(event) => patch(index, { endTime: event.target.value })} />
        <button type="button" aria-label={`删除快捷码 ${index + 1}`} disabled={shortcuts.length === 1} className="calendar-text-button h-9 w-9 p-0" onClick={() => { setShortcuts((current) => current.filter((_, position) => position !== index)); setDirty(true); setConfirmed(false); }}><Trash2 className="h-4 w-4" /></button>
      </div>)}</div>
      <button type="button" disabled={shortcuts.length >= 30} className="calendar-text-button mt-3" onClick={() => { setShortcuts((current) => [...current, { code: "", startTime: "09:00", endTime: "17:00" }]); setDirty(true); setConfirmed(false); }}><Plus className="h-4 w-4" />新增快捷码</button>
      <label className="mt-4 flex items-start gap-2 text-sm text-graphite-700"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我已核对本门店快捷码与时间</span></label>
      <button type="button" className="calendar-primary-button mt-3" disabled={!confirmed || (saved && !dirty)} onClick={() => void save()}>{saving ? "正在保存" : "保存本门店快捷码"}</button>
    </fieldset>
  </section>;
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }
