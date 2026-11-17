import React from 'react'
import { formatClock } from './timeDisplay'

type Slot = {date?:string|null;start:string;required:number;scheduled:number;on_break:number;effective:number}
type Row = Slot & {bucket:number}

export function ExactCoverageAnalysis({coverage,timezone}:{coverage:Slot[];timezone:string}) {
  const grouped = new Map<string,Row>()
  for (const slot of coverage) {
    const bucket=Math.floor(Date.parse(slot.start)/1800000)*1800000
    const key=`${slot.date??''}|${bucket}`
    const previous=grouped.get(key)
    if (!previous) grouped.set(key,{...slot,bucket})
    else {
      previous.scheduled=Math.min(previous.scheduled,slot.scheduled)
      previous.on_break=Math.max(previous.on_break,slot.on_break)
      previous.effective=Math.min(previous.effective,slot.effective)
    }
  }
  const rows=[...grouped.values()].sort((a,b)=>a.bucket-b.bucket)
  return <section className="panel coverageAnalysis">
    <div className="panelTitle"><h2>每 30 分钟排班核对</h2><span>Full 在覆盖的每个时段都计 1 人</span></div>
    <p className="help">设置人数必须等于已排人数。休息只减少当时实际在岗人数，不改变已排人数；短于 30 分钟的休息按该半小时内最低在岗人数显示。</p>
    <div className="coverageAnalysisScroll"><table><thead><tr>
      <th>日期</th><th>时间</th><th>设置人数</th><th>已排人数</th><th>最多同时休息</th><th>最低实际在岗</th>
    </tr></thead><tbody>{rows.map(row=><tr key={`${row.date}-${row.bucket}`} className={row.scheduled!==row.required?'coverageMissing':''}>
      <td>{row.date}</td><td>{formatClock(new Date(row.bucket).toISOString(),timezone)}</td>
      <td>{row.required}</td><td>{row.scheduled}</td><td>{row.on_break}</td><td>{row.effective}</td>
    </tr>)}</tbody></table></div>
  </section>
}
