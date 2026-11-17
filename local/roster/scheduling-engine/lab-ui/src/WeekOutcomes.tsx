import { ScheduleViews, type VisualShift } from './ScheduleViews'
import { ExactCoverageAnalysis } from './ExactCoverageAnalysis'
import './WeekOutcomes.css'

type Shift = VisualShift & {net_work_minutes:number}
type Slot = {date?:string|null;start:string;end:string;required:number;scheduled:number;on_break:number;effective:number;gap:number}
export type DayOutcome = {
  date:string
  status:string
  run?:{assignments:Shift[];coverage:Slot[];timezone:string;diagnostics:{message:string}[];validation_errors:string[]}
  error?:string
}

export function WeekOutcomes({outcomes,startDate,endDate,focusedDay,onDateChange,onSelect}: {
  outcomes:DayOutcome[];startDate:string;endDate:string;focusedDay:string
  onDateChange:(date:string)=>void;onSelect:(shift:VisualShift)=>void
}) {
  const assignments=outcomes.flatMap(item=>item.run?.assignments??[])
  const coverage=outcomes.flatMap(item=>item.run?.coverage??[])
  const timezone=outcomes.find(item=>item.run)?.run?.timezone??'Australia/Sydney'
  const completed=outcomes.length
  const feasible=outcomes.filter(item=>item.status==='OPTIMAL'||item.status==='FEASIBLE').length
  return <>
    <section className="panel weekOutcomes">
      <div className="panelTitle"><h2>逐日求解结果</h2><span>已完成 {completed}/7 天 · 可排 {feasible} 天</span></div>
      <p className="help">每天独立求解。只展示满足该日精确人数硬约束的班次；不可行日期保留诊断，不用其他日期的班次填补。</p>
      <div className="weekOutcomeGrid">{outcomes.map(item=><button key={item.date} type="button" onClick={()=>onDateChange(item.date)} className={focusedDay===item.date?'selected':''}>
        <strong>{item.date}</strong><span>{item.status}</span><small>{item.run?.assignments.length??0} 个完整班次</small>
      </button>)}</div>
      {outcomes.filter(item=>item.error||item.run?.diagnostics.length||item.run?.validation_errors.length).map(item=><div className="weekOutcomeDiagnostic" key={`${item.date}-diagnostic`}>
        <strong>{item.date} · {item.status}</strong>
        {item.error&&<p>{item.error}</p>}
        {item.run?.diagnostics.map((diagnostic,index)=><p key={index}>{diagnostic.message}</p>)}
        {item.run?.validation_errors.map((error,index)=><p key={`validation-${index}`}>{error}</p>)}
      </div>)}
    </section>
    {assignments.length>0&&<ScheduleViews assignments={assignments} coverage={coverage} timezone={timezone}
      startDate={startDate} endDate={endDate} week selectedDate={focusedDay}
      onDateChange={onDateChange} onSelect={onSelect}/>}
    {coverage.length>0&&<ExactCoverageAnalysis coverage={coverage} timezone={timezone}/>}
  </>
}
