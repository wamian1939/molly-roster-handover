import type { RosterSkillDefinition } from "../../types/workforce";

const categoryNames: Record<string, string> = {
  "Back Kitchen": "后厨",
  BackKitchen: "后厨",
  Bar: "水吧",
  Front: "前场",
  Operations: "操作能力",
};

export function SkillRequirementPicker({ skills, selected, onChange, loading, error, onRetry }: {
  skills: RosterSkillDefinition[];
  selected: string[];
  onChange: (codes: string[]) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const categories = [...new Set(skills.map((skill) => skill.category))];
  function toggle(code: string, checked: boolean) {
    onChange(checked ? [...selected, code] : selected.filter((value) => value !== code));
  }

  return <fieldset className="min-w-0 sm:col-span-2">
    <legend className="mb-1.5 text-sm font-semibold text-graphite-700">必要技能（已选 {selected.length} 项）</legend>
    {loading ? <p className="rounded-xl border border-graphite-200 bg-graphite-50 px-3 py-3 text-sm text-graphite-600" role="status">正在读取 Evaluate 技能目录…</p> : null}
    {error ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800" role="alert"><span>{error}</span><button type="button" className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={onRetry}>重新读取技能</button></div> : null}
    {!loading && !error && skills.length === 0 ? <p className="rounded-xl border border-graphite-200 px-3 py-3 text-sm text-graphite-600">当前没有可用技能，可创建不设必要技能的班次岗位。</p> : null}
    {!loading && !error && categories.length > 0 ? <div className="space-y-3 rounded-xl border border-graphite-200 p-3">
      {categories.map((category) => <div key={category}>
        <p className="mb-1 text-xs font-semibold text-graphite-600">{categoryNames[category] ?? category}</p>
        <div className="grid min-w-0 gap-1 sm:grid-cols-2">
          {skills.filter((skill) => skill.category === category).map((skill) => <label key={skill.code} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-graphite-800 hover:bg-graphite-50 focus-within:outline-2 focus-within:outline-brand-700">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-700" checked={selected.includes(skill.code)} onChange={(event) => toggle(skill.code, event.target.checked)} />
            <span className="min-w-0 break-words">{skill.nameZh} <span className="text-xs text-graphite-600">({skill.code})</span></span>
          </label>)}
        </div>
      </div>)}
    </div> : null}
  </fieldset>;
}
