import React from 'react'

export function ComparisonModeControl({enabled, onChange}: {
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return <div className="comparisonModeControl">
    <label>
      <input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked)}/>
      只读重排对比：从候选求解中排除目标日期已发布班次
    </label>
    <p>原班表仍作人工参考；其他门店、其他日期和锁定班次继续作为约束。仅在 Lab 内存中重排，不修改正式排班。</p>
  </div>
}

export function ComparisonModeNotice({mode, removed}: {mode: string; removed: number}) {
  return mode === 'REPLACE_TARGET_PUBLISHED'
    ? <p className="comparisonModeNotice">只读重排对比 · 已从候选求解中排除 {removed} 条目标日期已发布员工班次；原班表保留在下方人工参考中。</p>
    : null
}
