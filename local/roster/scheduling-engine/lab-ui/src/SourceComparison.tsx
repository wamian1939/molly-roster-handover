import React from 'react'
import type { ObservedShift } from './SourceReference'

type CandidateShift = {
  start: string
  end: string
  role_code: string
  breaks: [string, string][]
}

type ComparisonRow = ObservedShift & {
  candidate_people: number
}

export type LaborHoursSummary = {
  manualGrossMinutes: number
  manualBreakMinutes: number
  candidateGrossMinutes: number
  candidateBreakMinutes: number
}

// Count complete shifts that overlap the selected reference range. Use instants
// so overnight shifts and daylight-saving transitions retain their real length.
// A recorded break duration is enough for total active time, but not for
// reconstructing which half-hour coverage slot had a person on break.
export function summarizeLaborHours(reference: ObservedShift[],
  candidate: CandidateShift[]): LaborHoursSummary | null {
  const summary: LaborHoursSummary = {
    manualGrossMinutes: 0, manualBreakMinutes: 0,
    candidateGrossMinutes: 0, candidateBreakMinutes: 0,
  }
  for (const shift of reference) {
    const gross = (Date.parse(shift.end_instant) - Date.parse(shift.start_instant)) / 60000
    if (!Number.isFinite(gross) || gross <= 0 || !Number.isInteger(gross)
      || !Number.isInteger(shift.assigned_people) || shift.assigned_people < 1
      || !Number.isInteger(shift.break_minutes) || shift.break_minutes < 0
      || shift.break_minutes > gross) return null
    summary.manualGrossMinutes += gross * shift.assigned_people
    summary.manualBreakMinutes += shift.break_minutes * shift.assigned_people
  }
  for (const shift of candidate) {
    const start = Date.parse(shift.start)
    const end = Date.parse(shift.end)
    const gross = (end - start) / 60000
    if (!Number.isFinite(gross) || gross <= 0 || !Number.isInteger(gross)) return null
    let rest = 0
    const intervals: [number, number][] = []
    for (const [breakStart, breakEnd] of shift.breaks) {
      const begin = Date.parse(breakStart)
      const finish = Date.parse(breakEnd)
      const minutes = (finish - begin) / 60000
      if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes)
        || begin < start || finish > end) return null
      rest += minutes
      intervals.push([begin, finish])
    }
    intervals.sort((a, b) => a[0] - b[0])
    if (intervals.some(([begin], index) => index > 0 && begin < intervals[index - 1][1])) return null
    if (rest > gross) return null
    summary.candidateGrossMinutes += gross
    summary.candidateBreakMinutes += rest
  }
  return summary
}

function personHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} 人时`
}

export type ManualCoverageSpan = {
  start_instant: string
  end_instant: string
  scheduled: number
  possible_effective_min: number
  possible_effective_max: number
}

// The source has break durations but no break intervals. These are pointwise
// bounds only: each span's minimum need not occur for its entire duration.
export function summarizeManualCoverage(reference: ObservedShift[]): ManualCoverageSpan[] {
  const shifts = reference.map(shift => ({...shift,
    begin: Date.parse(shift.start_instant), finish: Date.parse(shift.end_instant)}))
    .filter(shift => Number.isFinite(shift.begin) && Number.isFinite(shift.finish)
      && shift.finish > shift.begin && shift.assigned_people > 0)
  const boundaries = [...new Set(shifts.flatMap(shift => [shift.begin, shift.finish]))]
    .sort((a, b) => a - b)
  const spans: ManualCoverageSpan[] = []
  for (let index = 0; index + 1 < boundaries.length; index++) {
    const begin = boundaries[index]
    const finish = boundaries[index + 1]
    const present = shifts.filter(shift => shift.begin <= begin && finish <= shift.finish)
    const scheduled = present.reduce((sum, shift) => sum + shift.assigned_people, 0)
    const uncertainBreaks = present.reduce((sum, shift) =>
      sum + (shift.break_minutes > 0 ? shift.assigned_people : 0), 0)
    spans.push({start_instant: new Date(begin).toISOString(),
      end_instant: new Date(finish).toISOString(), scheduled,
      possible_effective_min: scheduled - uncertainBreaks,
      possible_effective_max: scheduled})
  }
  return spans
}

function localStamp(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {timeZone: timezone, month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset'})
    .format(new Date(instant))
}

export function ManualCoverageBounds({reference, timezone}: {reference: ObservedShift[]; timezone: string}) {
  const spans = summarizeManualCoverage(reference)
  if (!spans.length) return null
  return <div className="manualCoverageBounds">
    <h3>人工班表在岗人数范围</h3>
    <p className="help">按已发布班次边界计算。休息只有时长、没有时刻；下界假设该时段内所有待定休息都可能发生，上界是假设该时刻无人休息。每段是逐时刻的保守范围，不能当作整段同时成立的精确覆盖，也不能据此判定是否满足需求。</p>
    <div className="comparisonScroll"><table className="comparisonTable"><thead><tr>
      <th>时间</th><th>已排班</th><th>可能有效在岗</th>
    </tr></thead><tbody>{spans.map(span =>
      <tr key={`${span.start_instant}-${span.end_instant}`}>
        <td>{localStamp(span.start_instant, timezone)} – {localStamp(span.end_instant, timezone)}</td>
        <td>{span.scheduled}</td>
        <td>{span.possible_effective_min === span.possible_effective_max
          ? span.possible_effective_min
          : `${span.possible_effective_min}–${span.possible_effective_max}`}</td>
      </tr>)}</tbody></table></div>
  </div>
}

function localParts(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const value = (part: string) => parts.find(item => item.type === part)?.value ?? ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`,
    clock: `${value('hour')}:${value('minute')}` }
}

function key(shift: ObservedShift) {
  return JSON.stringify([Date.parse(shift.start_instant), Date.parse(shift.end_instant),
    shift.role_code, shift.break_minutes])
}

export function summarizeCandidate(shifts: CandidateShift[], timezone: string): ObservedShift[] {
  const rows = new Map<string, ObservedShift>()
  for (const shift of shifts) {
    const start = localParts(shift.start, timezone)
    const end = localParts(shift.end, timezone)
    const breakMinutes = shift.breaks.reduce((total, [begin, finish]) =>
      total + (Date.parse(finish) - Date.parse(begin)) / 60000, 0)
    const item: ObservedShift = {
      date: start.date, start: start.clock, end: end.clock,
      start_instant: new Date(shift.start).toISOString(),
      end_instant: new Date(shift.end).toISOString(),
      end_next_day: end.date > start.date, role_code: shift.role_code,
      break_minutes: breakMinutes, assigned_people: 1,
    }
    const current = rows.get(key(item))
    if (current) current.assigned_people += 1
    else rows.set(key(item), item)
  }
  return [...rows.values()]
}

export function comparePublishedToCandidate(reference: ObservedShift[],
  candidate: CandidateShift[], timezone: string): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>()
  for (const shift of reference) {
    const current = rows.get(key(shift))
    if (current) current.assigned_people += shift.assigned_people
    else rows.set(key(shift), { ...shift, candidate_people: 0 })
  }
  for (const shift of summarizeCandidate(candidate, timezone)) {
    const current = rows.get(key(shift))
    if (current) current.candidate_people += shift.assigned_people
    else rows.set(key(shift), { ...shift, assigned_people: 0,
      candidate_people: shift.assigned_people })
  }
  return [...rows.values()].sort((a, b) => key(a).localeCompare(key(b)))
}

type Props = {
  reference: ObservedShift[]
  candidate: CandidateShift[]
  timezone: string
  snapshotVersion: string
  jobs: { id: string; name: string }[]
  comparisonMode: string
}

export function SourceComparison({ reference, candidate, timezone, snapshotVersion, jobs, comparisonMode }: Props) {
  const rows = comparePublishedToCandidate(reference, candidate, timezone)
  const laborHours = summarizeLaborHours(reference, candidate)
  const names = new Map(jobs.map(job => [job.id, job.name]))
  const manualTotal = reference.reduce((sum, shift) => sum + shift.assigned_people, 0)
  const candidateTotal = candidate.length
  const comparisonDescription = comparisonMode === 'REPLACE_TARGET_PUBLISHED'
    ? '本次候选在独立副本中重排目标日期的已发布班次；其他日期及锁定班次仍是约束。'
    : comparisonMode === 'PRESERVE_PUBLISHED'
      ? '本次候选保留目标日期的已发布班次。'
      : '这条历史运行没有记录对比模式，无法确认候选是否保留目标日期的已发布班次。'
  return <section className="panel sourceComparison">
    <div className="panelTitle"><h2>候选与人工班表对比</h2><span>同一次真实来源快照</span></div>
    <p className="help">来源版本 {snapshotVersion}。人工班次 {manualTotal} 人次，候选班次 {candidateTotal} 人次。{comparisonDescription}差异只表示相同日期、起止时间、岗位和休息时长档位的人数变化。</p>
    {laborHours && <div className="comparisonHours" aria-label="完整班次工时对比">
      <div><span>完整班次排班占用</span><strong>人工 {personHours(laborHours.manualGrossMinutes)} · 候选 {personHours(laborHours.candidateGrossMinutes)}</strong></div>
      <div><span>扣除休息后的在岗时长</span><strong>人工 {personHours(laborHours.manualGrossMinutes - laborHours.manualBreakMinutes)} · 候选 {personHours(laborHours.candidateGrossMinutes - laborHours.candidateBreakMinutes)}</strong></div>
      <p>按与所选日期重叠的完整班次累计。人工休息只有记录时长，没有发生时刻；不能据此判断逐时段覆盖。带薪状态未核对，不能据此估算工资成本或节省人力。</p>
    </div>}
    <p className="help">来源只记录休息时长，没有休息时刻。这里仅对比人工与候选的完整班次，不能据此判断逐时段在岗情况。</p>
    {rows.length ? <div className="comparisonScroll"><table className="comparisonTable"><thead><tr>
      <th>日期</th><th>时间</th><th>岗位</th><th>休息</th><th>人工</th><th>候选</th><th>差异</th>
    </tr></thead><tbody>{rows.map(row => {
      const change = row.candidate_people - row.assigned_people
      return <tr key={key(row)}><td>{row.date}</td>
        <td>{row.start}–{row.end}{row.end_next_day ? ' 次日' : ''}</td>
        <td>{row.role_code ? names.get(row.role_code) ?? row.role_code : '岗位未映射'}</td>
        <td>{row.break_minutes} 分钟</td><td>{row.assigned_people}</td>
        <td>{row.candidate_people}</td><td>{change > 0 ? `+${change}` : change}</td></tr>
    })}</tbody></table></div> : <p className="empty">这次运行没有已发布参考班次或候选班次。</p>}
    <ManualCoverageBounds reference={reference} timezone={timezone}/>
  </section>
}
