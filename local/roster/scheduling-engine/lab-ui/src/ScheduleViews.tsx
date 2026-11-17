import React, { useMemo } from 'react'
import { clippedBreak, clippedShift, coverageDay, dayWindow, rangeDays, shiftsForDay, type DayWindow } from './scheduleViewGeometry'
import { formatClock as localTime } from './timeDisplay'

export type VisualShift = {employee_id:string;employee_name:string;date:string;pattern_name:string;role_code:string;start:string;end:string;breaks:[string,string][];break_time_inferred?:boolean|null;fixed?:boolean;reasons:string[]}
export type VisualSlot = {date?:string|null;start:string;end:string;required:number;scheduled:number;on_break:number;effective:number;gap:number}

type Props = {assignments:VisualShift[];coverage:VisualSlot[];timezone:string;startDate:string;endDate:string;week:boolean;selectedDate:string;showEffective?:boolean;onDateChange:(date:string)=>void;onSelect:(shift:VisualShift)=>void}

function layout(shifts: VisualShift[], window: DayWindow) {
  const lanes: number[] = []
  const cards = shifts.flatMap(shift => {
    const span = clippedShift(shift, window)
    if (!span) return []
    let lane = lanes.findIndex(end => end <= span.start)
    if (lane < 0) lane = lanes.length
    lanes[lane] = span.end
    return [{shift, span, lane}]
  })
  return {cards, laneCount: Math.max(1, lanes.length)}
}

function VerticalDay({day, assignments, coverage, timezone, selected, showEffective, onDateChange, onSelect}: {
  day:string; assignments:VisualShift[]; coverage:VisualSlot[]; timezone:string; selected:boolean; showEffective?:boolean;
  onDateChange:(date:string)=>void; onSelect:(shift:VisualShift)=>void
}) {
  const dayShifts = shiftsForDay(assignments, coverage, day, timezone)
    .sort((a,b) => Date.parse(a.start)-Date.parse(b.start) || a.employee_name.localeCompare(b.employee_name))
  const daySlots = coverage.filter(item => coverageDay(item, timezone)===day)
    .sort((a,b) => Date.parse(a.start)-Date.parse(b.start))
  const shiftStarts = new Set(dayShifts.map(shift => Date.parse(shift.start)))
  const phaseSlots = daySlots.filter((slot,index) => index===0 || shiftStarts.has(Date.parse(slot.start)) ||
    slot.required!==daySlots[index-1].required)
  const window = dayWindow(coverage, day, timezone)
  const visible = window ? layout(dayShifts, window) : null
  const ticks = window ? coverage.filter(item => coverageDay(item, timezone)===day &&
    (localTime(item.start, timezone).endsWith(':00') || Date.parse(item.start)===window.start)) : []
  const height = window ? Math.max(360, (window.end-window.start)/3600000*54) : 0
  const percent = (instant:number) => window ? (instant-window.start)/(window.end-window.start)*100 : 0
  return <section className={`panel verticalDay${selected?' selected':''}`}>
    <div className="panelTitle"><h2><button className="dayHeading" onClick={()=>onDateChange(day)}>{day}</button></h2><span className="dayCoverageSummary">{dayShifts.length} 个员工班次 · {showEffective?'净在岗／最低':'排班人数'}：{phaseSlots.map(slot=>`${localTime(slot.start,timezone)} ${showEffective?slot.effective:slot.scheduled}/${slot.required}`).join(" · ")}</span></div>
    {!window || !visible?.cards.length ? <p className="empty">该日期没有可显示的候选班次。</p> :
      <div className="verticalCalendar" style={{height}}>
        <div className="verticalTimeAxis">{ticks.map(item => <span key={item.start} style={{top:`${percent(Date.parse(item.start))}%`}}>{localTime(item.start,timezone)}</span>)}<span style={{top:'100%'}}>{localTime(new Date(window.end).toISOString(),timezone)}</span></div>
        <div className="verticalLanes">
          {ticks.map(item => <div className="verticalHourLine" key={item.start} style={{top:`${percent(Date.parse(item.start))}%`}}/>)}
          {visible.cards.map(({shift,span,lane}) => <button key={`${shift.employee_id}-${shift.start}-${shift.pattern_name}`}
            className="verticalShift" style={{left:`${lane/visible.laneCount*100}%`,width:`${100/visible.laneCount}%`,top:`${percent(span.start)}%`,height:`${(span.end-span.start)/(window.end-window.start)*100}%`}}
            onClick={()=>{onDateChange(day);onSelect(shift)}}
            title={`${shift.employee_name} · ${localTime(shift.start,timezone)}–${localTime(shift.end,timezone)} · ${shift.pattern_name}`}>
            <strong>{shift.employee_name}</strong><span>{shift.pattern_name}</span>
            <span>{localTime(shift.start,timezone)}–{localTime(shift.end,timezone)}</span>
            {shift.breaks.map((interval,index)=>{
              const breakBar=clippedBreak(interval,span)
              return breakBar?<i key={index} className="verticalBreak" style={{top:`${breakBar.left}%`,height:`${breakBar.width}%`}}/>:null
            })}
          </button>)}
        </div>
      </div>}
  </section>
}

export function ScheduleViews({assignments,coverage,timezone,startDate,endDate,week,selectedDate,showEffective,onDateChange,onSelect}:Props){
  const dates=useMemo(()=>rangeDays(startDate,endDate),[startDate,endDate])
  const focused=dates.includes(selectedDate)?selectedDate:dates[0]
  return <div className="verticalSchedule">
    {(week?dates:[focused]).map(day=><VerticalDay key={day} day={day} assignments={assignments}
      coverage={coverage} timezone={timezone} selected={focused===day} showEffective={showEffective}
      onDateChange={onDateChange} onSelect={onSelect}/>)}
  </div>
}
