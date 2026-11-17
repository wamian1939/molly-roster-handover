import React from 'react'
import { formatClock } from './timeDisplay'

type Slot = {date?:string|null;start:string;end:string;required:number;target_staff?:number|null;
  max_staff?:number|null;scheduled:number;on_break:number;effective:number;gap:number;
  target_shortfall?:number;target_excess?:number}

type HalfHour = Slot & {bucket:number}

export function CoverageAnalysis({coverage,timezone,patternGap}: {
  coverage:Slot[];timezone:string;patternGap:number
}) {
  const grouped = new Map<string,HalfHour>()
  for (const slot of coverage) {
    const bucket = Math.floor(Date.parse(slot.start)/1800000)*1800000
    const key = `${slot.date??''}|${bucket}`
    const old = grouped.get(key)
    if (!old) {
      grouped.set(key,{...slot,bucket})
    } else {
      // A short break may occupy only ten minutes. Show the lowest actual
      // staffing inside each half hour so the table never hides that dip.
      old.effective = Math.min(old.effective,slot.effective)
      old.on_break = Math.max(old.on_break,slot.on_break)
      old.gap = Math.max(old.gap,slot.gap)
      old.target_shortfall = Math.max(old.target_shortfall??0,slot.target_shortfall??0)
      old.target_excess = Math.max(old.target_excess??0,slot.target_excess??0)
    }
  }
  const rows = [...grouped.values()].sort((a,b)=>a.bucket-b.bucket)
  return <section className="panel coverageAnalysis">
    <div className="panelTitle"><h2>每 30 分钟在岗覆盖</h2><span>休息期间不计入净在岗 · 班型最低数缺口 {patternGap}</span></div>
    <p className="help">表内净在岗为该半小时内的最低人数；目标以上属于软目标偏差，只有设置了硬上限并超过时才违反硬约束。</p>
    <div className="coverageAnalysisScroll"><table><thead><tr>
      <th>日期</th><th>时间</th><th>最低</th><th>目标</th><th>硬上限</th>
      <th>已排</th><th>最多休息</th><th>净在岗最低</th><th>最低缺口</th><th>超出目标</th>
    </tr></thead><tbody>{rows.map(row=><tr key={`${row.date}-${row.bucket}`} className={row.gap?'coverageMissing':''}>
      <td>{row.date}</td><td>{formatClock(new Date(row.bucket).toISOString(),timezone)}</td>
      <td>{row.required}</td><td>{row.target_staff??'—'}</td><td>{row.max_staff??'—'}</td>
      <td>{row.scheduled}</td><td>{row.on_break}</td><td>{row.effective}</td>
      <td>{row.gap}</td><td>{row.target_excess??0}</td>
    </tr>)}</tbody></table></div>
  </section>
}
