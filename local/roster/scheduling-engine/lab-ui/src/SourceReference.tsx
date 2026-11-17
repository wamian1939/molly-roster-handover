import React from 'react'
import { ManualCoverageBounds } from './SourceComparison'
import { rangeDays } from './scheduleViewGeometry'
import { missingPublishedDates } from './publishedReferenceDates'

export type ObservedShift = {
  date: string
  start: string
  end: string
  start_instant: string
  end_instant: string
  end_next_day: boolean
  role_code: string|null
  break_minutes: number
  assigned_people: number
}

export type SourceAlignment = ObservedShift & {
  role_and_availability_pool: number
  role_skill_availability_pool: number
  opening_qualified_role_and_availability_pool: number
  role_availability_no_external_overlap_pool: number
  role_skill_availability_no_external_overlap_pool: number
  opening_qualified_no_external_overlap_pool: number
  assigned_without_current_role: number
  assigned_without_required_skills: number
  assigned_without_full_availability: number
}

type Props = {
  shifts: ObservedShift[]
  alignment: SourceAlignment[]
  jobs: {id:string; name:string}[]
  timezone: string
  startDate: string
  endDate: string
}

export function SourceReference({shifts, alignment, jobs, timezone, startDate, endDate}: Props) {
  const names = new Map(jobs.map(job => [job.id, job.name]))
  const missingDates = missingPublishedDates(rangeDays(startDate, endDate), shifts, timezone)
  return <section className="panel sourceReference">
    <div className="panelTitle"><h2>现有已发布班次参考</h2><span>真实来源只读</span></div>
    <p className="help">列出与所选日期重叠的已发布完整班次，左侧日期为开班日；前一日跨午夜的班次也会显示。这些历史安排不能替代已核对的合法班型和人数规则。</p>
    {shifts.length ? <div className="referenceRows">{shifts.map((shift, index) =>
      <div className="referenceRow" key={`${shift.date}-${shift.start}-${shift.end}-${shift.role_code}-${index}`}>
        <strong>{shift.date}</strong><span>{shift.start}–{shift.end}{shift.end_next_day ? ' 次日' : ''}</span>
        <span>{shift.role_code ? names.get(shift.role_code) ?? shift.role_code : '岗位未映射'}</span>
        <span>休息 {shift.break_minutes} 分钟</span><strong>{shift.assigned_people} 人</strong>
      </div>)}</div> : <p className="empty">所选日期没有已发布班次覆盖记录。</p>}
    {alignment.length > 0 && <div className="sourceAlignment">
      <h3>正式岗位、技能与可用时间预检</h3>
      <p className="help">人数来自当前正式岗位、岗位必需技能、开店资格和已提交的整段可用时间；另显示排除来源中跨店重叠班次后的数量。不同班型的人员可能重复，不能相加。尚未扣除已批准请假、班间休息及适用劳动规则，不能视为可排班人数或合规结论。“未覆盖”也可能只是员工尚未提交完整可用时间。</p>
      <div className="alignmentHead"><span>已发布班次</span><span>已排</span><span>岗位且整段可用</span><span>已排岗位/技能缺口</span><span>已排可用未覆盖</span></div>
      {alignment.map((item, index) => <div className="alignmentRow" key={`${item.start_instant}-${item.end_instant}-${item.role_code}-${item.break_minutes}-${index}`}>
        <span>{item.date} {item.start}–{item.end}{item.end_next_day ? ' 次日' : ''} · {item.role_code ? names.get(item.role_code) ?? item.role_code : '岗位未映射'}</span>
        <strong>{item.assigned_people}</strong><strong>{item.role_and_availability_pool}<small>其中技能合格 {item.role_skill_availability_pool}，可独立开店 {item.opening_qualified_role_and_availability_pool}</small><small>排除跨店重叠后 {item.role_availability_no_external_overlap_pool}，其中技能合格 {item.role_skill_availability_no_external_overlap_pool}、可开店 {item.opening_qualified_no_external_overlap_pool}</small></strong>
        <span>{item.assigned_without_current_role} · 缺技能 {item.assigned_without_required_skills}</span><span>{item.assigned_without_full_availability}</span>
      </div>)}
    </div>}
    {missingDates.length > 0 && <p className="help">无已发布班次覆盖记录：{missingDates.join('、')}。这只表示当前来源没有记录，不能推断当天无需排班。</p>}
    <ManualCoverageBounds reference={shifts} timezone={timezone}/>
  </section>
}
