import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ScheduleViews, type VisualShift } from './ScheduleViews'
import { CoverageAnalysis } from './CoverageAnalysis'
import { RunSourceNotice } from './RunSourceNotice'
import { ExactStaffingEditor, type ExactBand } from './ExactStaffingEditor'
import { ExactCoverageAnalysis } from './ExactCoverageAnalysis'
import { WeekOutcomes, type DayOutcome } from './WeekOutcomes'
import { CurrentRuleNotice } from './CurrentRuleNotice'
import { RuleEditors, type EditablePattern } from './RuleEditors'
import { EmployeePreferencesEditor, type EmployeePreference } from './EmployeePreferencesEditor'
import { SourceReference, type ObservedShift, type SourceAlignment } from './SourceReference'
import { SourceComparison } from './SourceComparison'
import { type RosterRuleHints } from './SourceRuleHints'
import { ComparisonModeNotice } from './ComparisonModeControl'
import { formatClock as time } from './timeDisplay'
import { shiftsForDay } from './scheduleViewGeometry'
import { coveredSlotFraction } from './coverageSummary'
import { PatternGapNotice } from './PatternGapNotice'
import { RealAcceptanceNotice } from './RealAcceptanceNotice'
import { ScoreAllocation, type ScoreAllocationRow } from './ScoreAllocation'
import { apiErrorMessage } from './apiErrors'
import './style.css'

type Pattern = EditablePattern
type DayOverride = {pattern_minimums?:Record<string,number>|null;[key:string]:unknown}
type Rules = {store_id:string;timezone:string;timezone_source?:'ROSTER'|'LAB_CONFIRMED';version:string;copied_from?:string|null;global_base_version?:string|null;slot_minutes:15|30|60;base_day:{patterns:Pattern[]};weekly?:Record<string,DayOverride>;pattern_only:boolean;requirement_mode?:'PHASE_HEADCOUNT'|'PATTERN_AND_COVERAGE'|'EXACT_SCHEDULED';minimum_complete_shift_minutes?:number|null;weekly_coverage?:Record<string,{start:string;end:string;min_staff:number;target_staff:number;max_staff?:number|null;role_minimums?:Record<string,number>}[]>;weekly_exact_staffing?:Record<string,ExactBand[]>;weekly_pattern_bounds?:Record<string,Record<string,{minimum?:number|null;maximum?:number|null;exact?:number|null;allow_extra?:boolean}>>;requires_save?:boolean;migration_warnings?:string[];employee_preferences:Record<string,EmployeePreference>;weights:Record<string,number>;solve_seconds:number;random_seed:number}
type Shift = {employee_id:string;employee_name:string;date:string;pattern_name:string;role_code:string;start:string;end:string;breaks:[string,string][];break_time_inferred:boolean|null;fixed:boolean;net_work_minutes:number;reasons:string[]}
type Slot = {date?:string|null;start:string;end:string;required:number;scheduled:number;on_break:number;effective:number;excess:number;gap:number;effective_gap?:number;role_required?:Record<string,number>;role_effective?:Record<string,number>}
type Run = {run_id:string;engine_version:string;store_id:string;start_date:string;end_date:string;status:string;mode:string;source:string;run_purpose:'REVIEWED'|'EXPLORATORY';timezone:string;objective_score:number|null;snapshot_version:string;rule_version:string;elapsed_ms:number;assignments:Shift[];score_allocation?:ScoreAllocationRow[];coverage:Slot[];published_reference:ObservedShift[];diagnostics:{code:string;message:string;certainty:string;date?:string;start?:string;end?:string}[];validation_errors:string[];parameters:Record<string, string|number>}
type RunHistory = {run_id:string;status:string;source:string;mode:'STRICT'|'BEST_EFFORT';rule_version:string;snapshot_version:string;run_purpose:'REVIEWED'|'EXPLORATORY';created_at:string;start_date:string;end_date:string;assignment_count:number;engine_version:string}
type SourcePreview = {store_id:string;timezone:string;timezone_source:'ROSTER'|'LAB_CONFIRMED';snapshot_version:string;employees:number;availability_windows:number;existing_shift_assignments:number;observed_published_shifts:ObservedShift[];published_shift_source_alignment:SourceAlignment[];unresolved_fixed_breaks:{source_shift_id:string;start:string;end:string;recorded_break_minutes:number;assigned_people:number}[];rule_hints:RosterRuleHints;approved_leave_source_available:boolean;formal_roster_write:boolean}

function editableRules(value: Rules): Rules {
  return {store_id:value.store_id, timezone:value.timezone, timezone_source:value.timezone_source,
    version:value.version, copied_from:value.copied_from, global_base_version:value.global_base_version,
    slot_minutes:value.slot_minutes, requirement_mode:value.requirement_mode,
    minimum_complete_shift_minutes:value.minimum_complete_shift_minutes,
    weekly_coverage:value.weekly_coverage, weekly_exact_staffing:value.weekly_exact_staffing,
    weekly_pattern_bounds:value.weekly_pattern_bounds,
    base_day:{patterns:value.base_day.patterns.map(pattern=>({...pattern,
      break_rule:{count:pattern.break_rule.count,duration_minutes:pattern.break_rule.duration_minutes,
        paid:pattern.break_rule.paid,granularity_minutes:pattern.break_rule.granularity_minutes}}))}, weekly:value.weekly, pattern_only:true,
    employee_preferences:value.employee_preferences, weights:value.weights,
    solve_seconds:value.solve_seconds, random_seed:value.random_seed}
}

const today = new Date().toLocaleDateString('en-CA', {timeZone:'Australia/Sydney'})
const todayUtc = new Date(`${today}T00:00:00Z`)
const weekStart = new Date(todayUtc.getTime() - ((todayUtc.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10)
const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6*86400000).toISOString().slice(0,10)
async function api<T>(path:string, init?:RequestInit):Promise<T> {
  const response = await fetch(path, {...init, credentials:'include', headers:{'content-type':'application/json', ...init?.headers}})
  const body = await response.json()
  if (!response.ok) throw new Error(apiErrorMessage(body,response.status))
  return body as T
}
const percent = (value:number) => `${Math.round(value*100)}%`
const objectiveStageLabel = (stage:string|number|undefined, proven:string|number|undefined) => `${({pattern_gap:'班型人数缺口',official_score:'正式评分优先',work_efficiency:'工时效率',staffing_gap:'排班人数缺口',coverage_gap:'排班人数缺口',effective_gap:'休息后的净在岗缺口',coverage_efficiency:'覆盖与工时',preferences:'员工偏好',requirement_gap:'班型与净在岗缺口',operating_fit:'运营匹配',schedule_quality:'排班质量',balanced_objective:'评分与工时综合优化'}[String(stage??'')]??'暂无目标')}${proven===0?' · 未证最优':''}`

function App(){
  const [tab,setTab] = useState<'rules'|'calendar'>('calendar')
  const store = 'hurstville'
  const [jobs,setJobs] = useState<{id:string;name:string;code:string|null;isActive:boolean}[]>([])
  const [staffTargets,setStaffTargets] = useState<{id:string;name:string;employment_type:string|null}[]>([])
  const [rules,setRules] = useState<Rules|null>(null)
  const [savedRulesJson,setSavedRulesJson] = useState<string|null>(null)
  const [raw,setRaw] = useState('')
  const [rawEdited,setRawEdited] = useState(false)
  const [date,setDate] = useState(weekStart)
  const [focusedDay,setFocusedDay] = useState(weekStart)
  const [viewMode,setViewMode] = useState<'DAY'|'WEEK'>('WEEK')
  const [source] = useState<'MOCK'|'REAL'>('REAL')
  const [mode,setMode] = useState<'STRICT'|'BEST_EFFORT'>('BEST_EFFORT')
  const comparisonMode = true
  const exploratory = true
  const [leaveReviewScope,setLeaveReviewScope] = useState<string|null>(null)
  const [leaveJson,setLeaveJson] = useState('[]')
  const [preview,setPreview] = useState<SourcePreview|null>(null)
  const [previewScope,setPreviewScope] = useState<string|null>(null)
  const previewGeneration = useRef(0)
  const [result,setResult] = useState<Run|null>(null)
  const [weekOutcomes,setWeekOutcomes] = useState<DayOutcome[]>([])
  const [selectedShift,setSelectedShift] = useState<VisualShift|null>(null)
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(()=>{let cancelled=false;setRules(null);setSavedRulesJson(null);setRaw('');setRawEdited(false);api<Rules>(`/api/rules/${encodeURIComponent(store)}`).then(value=>{if(cancelled)return;const draft=editableRules(value);setRules(draft);setMode('STRICT');setSavedRulesJson(value.requires_save?null:JSON.stringify(draft));setRaw(JSON.stringify(draft,null,2));setMessage(value.requirement_mode==='EXACT_SCHEDULED'?'':'请先保存最新的精确排班人数规则。')}).catch(error=>{if(!cancelled)setMessage(String(error))});return()=>{cancelled=true}},[store])
  useEffect(()=>{let cancelled=false;setJobs([]);api<{id:string;name:string;code:string|null;isActive:boolean}[]>(`/api/store-jobs/${encodeURIComponent(store)}`).then(value=>{if(!cancelled)setJobs(value)}).catch(()=>{if(!cancelled)setJobs([])});return()=>{cancelled=true}},[store])
  useEffect(()=>{let cancelled=false;setStaffTargets([]);api<{id:string;name:string;employment_type:string|null}[]>(`/api/employee-rule-targets/${encodeURIComponent(store)}`).then(value=>{if(!cancelled)setStaffTargets(value)}).catch(()=>{if(!cancelled)setStaffTargets([])});return()=>{cancelled=true}},[store])
  useEffect(()=>{if(!rules)return;let cancelled=false;setResult(null);setPreview(null);setPreviewScope(null);setSelectedShift(null);api<{runs:RunHistory[]}>(`/api/runs/${encodeURIComponent(store)}`).then(async value=>{if(cancelled)return;const latestVisible=value.runs.find(item=>item.source==='REAL'&&item.run_purpose==='EXPLORATORY'&&item.engine_version.startsWith('v2-')&&item.rule_version===rules.version&&item.start_date===weekStart&&item.end_date===weekEnd&&item.assignment_count>0&&(item.status==='FEASIBLE'||item.status==='OPTIMAL'));if(!latestVisible)return;try{const saved=await api<Run>(`/api/run/${latestVisible.run_id}`);if(cancelled||saved.store_id!==store||saved.rule_version!==rules.version||saved.start_date!==weekStart||saved.end_date!==weekEnd||saved.assignments.length===0)return;setResult(saved);setMode('STRICT');setFocusedDay(saved.start_date)}catch{/* Current-version result remains empty. */}}).catch(()=>{});return()=>{cancelled=true}},[store,rules?.version])
  useEffect(()=>{
    if (!rules || viewMode!=='WEEK' || rules.requirement_mode!=='EXACT_SCHEDULED') {
      setWeekOutcomes([])
      return
    }
    let cancelled=false
    setWeekOutcomes([])
    const dates=Array.from({length:7},(_,index)=>new Date(Date.parse(`${date}T00:00:00Z`)+index*86400000).toISOString().slice(0,10))
    api<{runs:RunHistory[]}>(`/api/runs/${encodeURIComponent(store)}`).then(async value=>{
      const selected=dates.flatMap(day=>{
        const latest=value.runs.find(item=>item.source==='REAL'&&item.run_purpose==='EXPLORATORY'&&item.engine_version.startsWith('v2-')&&item.rule_version===rules.version&&item.start_date===day&&item.end_date===day)
        return latest?[{day,runId:latest.run_id}]:[]
      })
      const loaded=await Promise.all(selected.map(async item=>{
        try {
          const run=await api<Run>(`/api/run/${item.runId}`)
          return run.rule_version===rules.version?{date:item.day,status:run.status,run}:null
        } catch { return null }
      }))
      if (!cancelled) setWeekOutcomes(loaded.filter(item=>item!==null) as DayOutcome[])
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[store,rules?.version,date,viewMode])
  useEffect(()=>{setLeaveReviewScope(null);},[store,date,viewMode,source,rules?.version,preview?.snapshot_version])
  useEffect(()=>{setLeaveJson('[]')},[store])
  useEffect(()=>{previewGeneration.current++;setPreview(null);setPreviewScope(null)},[store,date,viewMode,source])
  useEffect(()=>{if(rules&&!rawEdited)setRaw(JSON.stringify(rules,null,2))},[rules,rawEdited])
  const ruleSaveHeaders = () => {const version = rules?.version; return {'X-Expected-Rule-Version': version && !version.startsWith('UNSAVED_') ? version : '__NONE__'}}
  const save = async()=>{if(!rules)return;setBusy(true);setMessage('');try{const parsed=JSON.parse(raw) as Rules; const saved=await api<Rules>(`/api/rules/${encodeURIComponent(store)}`,{method:'POST',headers:ruleSaveHeaders(),body:JSON.stringify({...parsed,store_id:store})});setRules(saved);setSavedRulesJson(JSON.stringify(saved));setRaw(JSON.stringify(saved,null,2));setRawEdited(false);setMessage(`已保存规则版本 ${saved.version}`)}catch(error){setMessage(`保存失败：${String(error)}`)}finally{setBusy(false)}}
  const saveForm = async()=>{if(!rules)return;if(rawEdited){setMessage('JSON 草稿尚未应用；请先保存 JSON，或舍弃 JSON 草稿后再保存表单。');return}setBusy(true);setMessage('');try{const prepared=editableRules(rules);const saved=await api<Rules>(`/api/rules/${encodeURIComponent(store)}`,{method:'POST',headers:ruleSaveHeaders(),body:JSON.stringify(prepared)});setRules(saved);setSavedRulesJson(JSON.stringify(saved));setRaw(JSON.stringify(saved,null,2));setMessage(`已保存规则版本 ${saved.version}`)}catch(error){setMessage(`保存失败：${String(error)}`)}finally{setBusy(false)}}
  const endDate = viewMode==='WEEK' ? new Date(Date.parse(`${date}T00:00:00Z`)+6*86400000).toISOString().slice(0,10) : date
  const sourceScope = JSON.stringify([store,date,endDate])
  const previewRequestScope = JSON.stringify([sourceScope,source])
  const reviewScope = JSON.stringify([sourceScope,source,rules?.version,preview?.snapshot_version])
  const leaveScope = JSON.stringify([reviewScope,leaveJson])
  const leaveConfirmed = leaveReviewScope===leaveScope
  const run = async()=>{
    if(!rules||!savedRulesJson||rawEdited||
       JSON.stringify(editableRules(rules))!==JSON.stringify(editableRules(JSON.parse(savedRulesJson) as Rules))){
      setMessage('当前规则有未保存的改动；请先保存排班规则。');return
    }
    if(source==='REAL'&&exploratory&&!comparisonMode){
      setMessage('探索性模拟必须先勾选只读重排对比，避免把已发布班次当作模拟规则认可的班型。');return
    }
    if(source==='REAL'&&!exploratory){
      setMessage('真实数据候选排班只支持探索性只读对比。');return
    }
    setBusy(true);setMessage('')
    if(viewMode==='WEEK'&&rules.requirement_mode==='EXACT_SCHEDULED'){
      setResult(null);setWeekOutcomes([]);setSelectedShift(null);setTab('calendar')
      try{
        const approvedLeave=JSON.parse(leaveJson)
        let firstFeasibleShown=false
        for(let index=0;index<7;index++){
          const day=new Date(Date.parse(`${date}T00:00:00Z`)+index*86400000).toISOString().slice(0,10)
          try{
            setMessage(`正在求解 ${day}（${index+1}/7）`)
            const dayPreview=await api<SourcePreview>(`/api/source-preview/${encodeURIComponent(store)}?start_date=${day}&end_date=${day}`)
            const value=await api<Run>('/api/solve',{method:'POST',body:JSON.stringify({
              store_id:store,start_date:day,end_date:day,expected_rule_version:rules.version,
              expected_source_version:dayPreview.snapshot_version,source,mode,
              run_purpose:'EXPLORATORY',leave_data_complete:leaveConfirmed,
              approved_leave:approvedLeave,fixed_break_intervals:[],
              replace_target_published_for_comparison:true,
            })})
            setWeekOutcomes(current=>[...current,{date:day,status:value.status,run:value}])
            if(value.assignments.length>0&&!firstFeasibleShown){
              setFocusedDay(day)
              firstFeasibleShown=true
            }
          }catch(error){
            setWeekOutcomes(current=>[...current,{date:day,status:'ERROR',error:String(error)}])
          }
        }
        setMessage('七天逐日求解完成；可排日期与不可行诊断已分别显示。')
      }catch(error){setMessage('求解失败：'+String(error))}
      finally{setBusy(false)}
      return
    }
    try{
      let currentPreview=preview
      if(!currentPreview||previewScope!==previewRequestScope||currentPreview.store_id!==store){
        currentPreview=await api<SourcePreview>(`/api/source-preview/${encodeURIComponent(store)}?start_date=${date}&end_date=${endDate}`)
        setPreview(currentPreview);setPreviewScope(previewRequestScope)
      }
      const value=await api<Run>('/api/solve',{method:'POST',body:JSON.stringify({
        store_id:store,start_date:date,end_date:endDate,expected_rule_version:rules.version,
        expected_source_version:currentPreview.snapshot_version,source,mode,
        run_purpose:source==='REAL'&&exploratory?'EXPLORATORY':'REVIEWED',
        leave_data_complete:leaveConfirmed,
        approved_leave:JSON.parse(leaveJson),fixed_break_intervals:[],
        replace_target_published_for_comparison:source==='REAL'&&comparisonMode,
      })})
      setResult(value);setFocusedDay(date);setSelectedShift(null);setTab('calendar')
      setMessage('运行 '+value.run_id+' · '+value.status)
    }catch(error){setMessage('求解失败：'+String(error))}
    finally{setBusy(false)}
  }
  const previewSource = async()=>{const requestId=++previewGeneration.current;setBusy(true);setMessage('');setPreview(null);setPreviewScope(null);setResult(null);setSelectedShift(null);try{const value=await api<SourcePreview>(`/api/source-preview/${encodeURIComponent(store)}?start_date=${date}&end_date=${endDate}`);if(requestId!==previewGeneration.current)return;setPreview(value);setPreviewScope(previewRequestScope);setMessage('真实来源读取成功；没有写入正式排班')}catch(error){if(requestId===previewGeneration.current)setMessage(`真实来源读取失败：${String(error)}`)}finally{setBusy(false)}}
  const uncertainFixedBreak=!!result?.assignments.some(shift=>shift.fixed&&shift.breaks.length>0&&shift.break_time_inferred!==false)
  const coverageRate=useMemo(()=>coveredSlotFraction(result?.coverage??[],result?.diagnostics??[]),[result])
  const patternGaps=result?.diagnostics.filter(item=>item.code==='PATTERN_STAFFING_GAP'||item.code==='V2_PATTERN_GAP')??[]
  const coverageGaps=result?.coverage.reduce((total,slot)=>total+slot.gap,0)??0
  const displayedAssignments=result?shiftsForDay(result.assignments,result.coverage,focusedDay,result.timezone):[]
  return <div className="app"><aside><div className="brand"><span className="brandMark">M</span><div><strong>Molly Roster</strong><small>Scheduling Engine Lab</small></div></div><nav><a href="http://127.0.0.1:4191/" style={{display:"block",padding:"12px 14px",color:"inherit",textDecoration:"none"}}>Multi-Agent 排班测试 ↗</a><button className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>规则配置</button><button className={tab==='calendar'?'active':''} onClick={()=>setTab('calendar')}>排班日历</button></nav><div className="asideFoot">独立测试环境<br/>结果不会写入正式班次</div></aside><main><header><div><div className="eyebrow">SCHEDULING ENGINE LAB</div><h1>{tab==='rules'?'排班规则':'候选班表'}</h1><p>按每天设置的时段人数排班；先展示能排的班次，再标记缺口。</p></div><div className="headerActions"><span className="storeName">Hurstville</span><span className="version">{rules?.version || '未载入'}</span></div></header>{message&&<div className="notice" role="status">{message}</div>}{tab==='rules'&&rules&&<section className="panel ruleValidity"><div className="panelTitle"><h2>门店时区</h2><span>用于解释员工可用时间与班次日期</span></div><div className="ruleValidityFields"><label>门店时区（IANA）<input type="text" value={rules.timezone} onChange={e=>setRules(current=>current?{...current,timezone:e.target.value}:current)}/></label><label>真实来源时区依据<select value={rules.timezone_source??'ROSTER'} onChange={e=>setRules(current=>current?{...current,timezone_source:e.target.value as 'ROSTER'|'LAB_CONFIRMED'}:current)}><option value="ROSTER">正式 Roster 设置</option><option value="LAB_CONFIRMED">已核实：Lab 独立配置</option></select></label></div><p className="help">只有正式 Roster 尚无该门店时区记录时，才可选择 Lab 独立配置。正式记录一旦出现或与规则冲突，真实来源读取会停止并要求重新核对。</p></section>}
  {tab==='rules'&&rules?.requirement_mode==='EXACT_SCHEDULED'&&<ExactStaffingEditor weekly={rules.weekly_exact_staffing??{}} onChange={weekly_exact_staffing=>setRules({...rules,weekly_exact_staffing})}/>}
   {tab==='rules'&&rules&&<EmployeePreferencesEditor key={`preferences-${store}`} employees={staffTargets}
    preferences={rules.employee_preferences??{}} laborCostWeight={rules.weights.labor_cost??0}
    onChange={employee_preferences=>setRules({...rules,employee_preferences})}/>}
  {tab==='rules'&&rules&&<RuleEditors patterns={rules.base_day.patterns} jobs={jobs} weights={rules.weights} solveSeconds={rules.solve_seconds} onPatternsChange={patterns=>setRules({...rules,base_day:{...rules.base_day,patterns}})} onWeightsChange={weights=>setRules({...rules,weights})} onSecondsChange={solve_seconds=>setRules({...rules,solve_seconds})}/>} {tab==='rules'&&rules&&<button className="primary" onClick={saveForm} disabled={busy}>保存排班规则</button>}
  {tab==='calendar'&&<><section className="panel runPanel"><div className="panelTitle"><h2>生成候选排班</h2><span>只在 Lab 保存运行结果</span></div><div className="runControls"><label>日期<input type="date" value={date} onInput={e=>setDate((e.target as HTMLInputElement).value)} onChange={e=>setDate(e.target.value)}/></label><label>视图<select value={viewMode} onChange={e=>setViewMode(e.target.value as 'DAY'|'WEEK')}><option value="DAY">日</option><option value="WEEK">周</option></select></label><span className="sourceFixed">Hurstville 真实数据 · 只读</span><span className="sourceFixed">精确人数</span><button className="primary" disabled={busy} onClick={run}>{busy?'正在求解…':'自动排班'}</button>{source==='REAL'&&<button className="secondary" disabled={busy} onClick={previewSource}>检查真实来源</button>}</div>
  {weekOutcomes.length>0&&viewMode==='WEEK'&&<WeekOutcomes outcomes={weekOutcomes} startDate={date} endDate={endDate} focusedDay={focusedDay} onDateChange={setFocusedDay} onSelect={setSelectedShift}/>}
  {weekOutcomes.length>0&&selectedShift&&<section className="panel reasonPanel"><strong>{selectedShift.employee_name} · {selectedShift.pattern_name}</strong><ul>{selectedShift.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></section>}
  {source==='REAL'&&preview&&<p className="sourcePreview">真实日期时区：{preview.timezone} · 依据：{preview.timezone_source==='LAB_CONFIRMED'?'Lab 规则中人工核实':'正式 Roster 设置'}</p>}
{source==='REAL'&&preview&&<p className="sourcePreview">员工 {preview.employees} 人 / 可用时间 {preview.availability_windows} 段 / 周边班次 {preview.existing_shift_assignments} 条 / {preview.snapshot_version}</p>}{source==='REAL'&&<div className="attestation"><strong>真实数据边界</strong><p>班型人数规则仅用于探索性模拟，候选结果不可直接发布。</p><label><input type="checkbox" checked={leaveConfirmed} onChange={e=>setLeaveReviewScope(e.target.checked?leaveScope:null)}/> 已核查所选日期范围内全部已批准请假，没有遗漏</label><label>已批准请假 JSON<textarea className="leaveInput" value={leaveJson} onChange={e=>{setLeaveJson(e.target.value);setLeaveReviewScope(null)}} spellCheck={false}/></label><small>输入 employee_id、带时区的 start 和 end 。[] 仅表示当前列表为空；核查完成后再勾选上方确认项。</small>{preview?.unresolved_fixed_breaks?.length ? <div className="unresolvedBreaks"><strong>已发布班次仅记录休息时长</strong><ul>{preview.unresolved_fixed_breaks.map(item=><li key={item.source_shift_id}><code>{item.source_shift_id}</code> · {new Intl.DateTimeFormat('zh-CN',{timeZone:preview.timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(item.start))}–{new Intl.DateTimeFormat('zh-CN',{timeZone:preview.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(item.end))} · 已记录休息 {item.recorded_break_minutes} 分钟 · {item.assigned_people} 人</li>)}</ul></div>:null}<p>休息只记录时长；本模式不要求指定发生时刻。</p></div>}</section>{!result&&rules&&<CurrentRuleNotice version={rules.version} mode={rules.requirement_mode}/>} {result&&<RunSourceNotice savedRuleVersion={rules?.version??null} runRuleVersion={result.rule_version} runMode={result.mode} runId={result.run_id}/>} {result&&<div className="runContext" role="note"><strong>当前展示的运行快照</strong><span>{result.run_id} · {result.start_date}{result.end_date!==result.start_date?` 至 ${result.end_date}`:""} · {result.source==="REAL"?"真实数据（只读）":"模拟数据"} · {result.mode==="STRICT"?"严格":"尽力并标记缺口"} · {result.run_purpose==="EXPLORATORY"?"探索性模拟":"核查模式"} · 规则 {result.rule_version} · 引擎 {result.engine_version}</span><small>上方控制用于下一次求解；此处结果以保存时的规则和来源快照为准。</small></div>}{result&&<>{result.run_purpose==='EXPLORATORY'&&<div className="exploratoryWarning" role="alert">探索性模拟 · 不可验收或发布。OPTIMAL / FEASIBLE 仅描述已保存的精确时段人数规则和已知来源数据。</div>}{result.source==="REAL"&&<RealAcceptanceNotice parameters={result.parameters} status={result.status}/>}<div className="metrics"><div><small>状态</small><strong>{result.status}</strong></div><div><small>完整班次</small><strong>{result.assignments.length}</strong></div><div><small>{result.parameters.model==='V2_COVERAGE_EXPERIMENT'?(result.parameters.coverage_semantics==='EXACT_SCHEDULED'?'排班人数偏差（人·半小时）':result.parameters.coverage_semantics==='MIN_EFFECTIVE_WITH_PATTERN_BOUNDS'?`最低在岗缺口（人·${result.parameters.coverage_slot_minutes??30}分钟）`:result.parameters.coverage_semantics==='EXACT_ROSTER_HEADCOUNT'?'排班人数缺口（人·半小时）':'缺口（时段·人）'):result.parameters.pattern_only===1?'班型人数缺口':uncertainFixedBreak?'时段覆盖（含岗位、未确认休息）':'时段覆盖（含岗位）'}</small><strong>{result.parameters.model==='V2_COVERAGE_EXPERIMENT'?coverageGaps:result.parameters.pattern_only===1?patternGaps.length:coverageRate===null?'—':percent(coverageRate)}</strong></div><div><small>用时</small><strong>{result.elapsed_ms} ms</strong></div><div><small>优化分数 · {objectiveStageLabel(result.parameters.objective_stage,result.parameters.priority_proven)}</small><strong>{result.objective_score??'—'}</strong></div></div><PatternGapNotice diagnostics={patternGaps}/><ScheduleViews assignments={result.parameters.pattern_only===1?result.assignments.map(shift=>({...shift,breaks:[]})):result.assignments} coverage={result.coverage} timezone={result.timezone} showEffective={result.parameters.coverage_semantics==='MIN_EFFECTIVE_WITH_PATTERN_BOUNDS'} startDate={result.start_date} endDate={result.end_date} week={viewMode==='WEEK'} selectedDate={focusedDay} onDateChange={setFocusedDay} onSelect={setSelectedShift}/>{result.parameters.coverage_semantics==='EXACT_SCHEDULED'&&<ExactCoverageAnalysis coverage={result.coverage} timezone={result.timezone}/>} {result.parameters.coverage_semantics==='MIN_EFFECTIVE_WITH_PATTERN_BOUNDS'&&<CoverageAnalysis coverage={result.coverage} timezone={result.timezone} patternGap={Number(result.parameters.metric_pattern_gap??0)}/>} {result.source==="REAL"&&<ScoreAllocation rows={result.score_allocation??[]} parameters={result.parameters} objectiveScore={result.objective_score}/>} {selectedShift&&<section className="reasonPanel"><strong>{selectedShift.employee_name} · {selectedShift.pattern_name}</strong><ul>{selectedShift.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></section>}<section className="panel"><div className="panelTitle"><h2>{focusedDay} 完整班次</h2><span>每人每班与休息信息</span></div><div className="shiftList">{displayedAssignments.length===0?<p className="empty">没有可展示的班次。请查看诊断。</p>:displayedAssignments.map((shift,index)=><article className="shift" key={`${shift.employee_id}-${index}`}><div className="shiftTime"><strong>{time(shift.start,result.timezone)} – {time(shift.end,result.timezone)}</strong><small>{shift.net_work_minutes/60} 小时净工时</small></div><div><strong>{shift.employee_name}</strong><small>{shift.date!==focusedDay?'前日开班 · ':''}{shift.pattern_name} · {shift.role_code}</small></div><div className="breaks">{result.parameters.pattern_only===1&&shift.breaks.length&& !shift.fixed?<span>休息 {shift.breaks.reduce((total,[a,b])=>total+(Date.parse(b)-Date.parse(a))/60000,0)} 分钟，时间未定</span>:shift.breaks.length?shift.breaks.map(([a,b],i)=><span key={i}>{shift.break_time_inferred===true?'模拟休息':shift.fixed&&shift.break_time_inferred===false?'已记录休息':shift.fixed?'休息（来源未标记）':'建议休息'} {time(a,result.timezone)}–{time(b,result.timezone)}</span>):<span>无休息</span>}</div></article>)}</div></section><section className="panel"><div className="panelTitle"><h2>诊断与验证</h2><span>{result.snapshot_version} · {result.rule_version}</span></div>{result.diagnostics.length===0&&result.validation_errors.length===0?<p className="success">{result.parameters.coverage_semantics==='EXACT_SCHEDULED'?'每个时段的已排人数均与设置一致；休息后的实际在岗人数另列。':result.parameters.coverage_semantics==='MIN_EFFECTIVE_WITH_PATTERN_BOUNDS'?'班型数量与净在岗最低需求检查通过。':result.parameters.coverage_semantics==='EXACT_ROSTER_HEADCOUNT'?'排班人数符合时段目标；休息后的净在岗人数另列。':result.parameters.pattern_only===1?'班型人数与班次结构检查通过。':uncertainFixedBreak?'独立验证通过；按展示的休息位置计算没有覆盖缺口。未定时休息的实际覆盖取决于发生时间。':'独立验证通过；排班人数符合时段目标。休息后的净在岗人数另列。'}</p>:<ul className="diagnostics">{result.diagnostics.map((item,index)=><li key={index}><strong>{item.code} · {item.certainty}</strong><span>{item.date ? `${item.date} · ` : ''}{item.message}</span></li>)}{result.validation_errors.map((error,index)=><li key={`v${index}`}><strong>验证失败</strong><span>{error}</span></li>)}</ul>}</section></>}</>}
  {tab==='calendar'&&result?.source==='REAL'&&result.store_id===store
    ? <><ComparisonModeNotice mode={String(result.parameters?.comparison_mode??'')} removed={Number(result.parameters?.comparison_removed_assignments??0)}/><SourceComparison reference={result.published_reference} candidate={result.assignments}
        timezone={result.timezone} snapshotVersion={result.snapshot_version} jobs={jobs}
        comparisonMode={String(result.parameters?.comparison_mode??'')}/></>
    : tab==='calendar'&&source==='REAL'&&preview
      ? <SourceReference shifts={preview.observed_published_shifts} alignment={preview.published_shift_source_alignment} jobs={jobs}
          timezone={preview.timezone} startDate={date} endDate={endDate}/>
      : null}
  </main></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
