import React,{useEffect,useState} from 'react'
import {ScheduleViews,type VisualShift,type VisualSlot} from '../ScheduleViews'
import {formatClock} from '../timeDisplay'

type Shift={id:string;employee_id:string;date:string;pattern_name:string;role_code:string;start:string;end:string;fixed:boolean;reason:string}
type Slot={date:string;start:string;end:string;required:number;scheduled:number;difference:number;employee_ids:string[]}
type Event={sequence:number;kind:string;agent?:string;date?:string;status?:string;assignments?:Shift[];errors?:unknown}
type AllocationReport={rule_version:string;total_rated_target_minutes:number;required_coverage_minutes:number;
 rating_policy:{highest_score_fraction:number;bands:{minimum_score:number;fraction:number}[]}|null;
 rows:{employee_id:string;employee_name:string;rating:number|null;available_minutes:number;target_fraction:number|null;target_scheduled_minutes:number|null;target_assigned_minutes:number;actual_fraction:number|null;difference_minutes:number|null;maximum_candidate_minutes?:number;target_exceeds_individual_capacity?:boolean}[];
 mandatory_coverage:{date:string;employee_id:string;employee_name:string;start:string;end:string;satisfied:boolean;shifts:{pattern_name:string;start:string;end:string}[]}[]}
type Data={status:string;source:'REAL';timezone:string;start_date:string;end_date:string;preview_assignments?:Shift[];preview_coverage?:Slot[];
 allocation_report?:AllocationReport|null;
 source_diagnostics?:{date:string;proven_slot_conflicts:{message?:string;start?:string;required?:number;eligible_employee_ids?:string[]}[]}[];
 employees:{id:string;name:string;score:number|null}[];
 provenance:{fetched_at:string;employee_count:number;availability_count:number;rating_source:string};
 events:Event[];history:unknown[];result:null|{status:string;assignments:Shift[];policy:{fairness_weight:number;preference_weight:number};
 failed_days:{date:string;reason:string;errors:{start?:string;end?:string;required?:number;eligible_employee_ids?:string[];message?:string}[]}[];
 ledger:{employees:{employee_id:string;rating:number|null;shift_count:number;total_scheduled_minutes:number}[]};
 validation:{valid:boolean;coverage:Slot[];errors:{code:string;message:string}[]}}}

export function RealResultApp(){
 const token=new URLSearchParams(location.search).get('real')??''
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[week,setWeek]=useState(true)
 const [day,setDay]=useState('2026-10-26'),[selected,setSelected]=useState<VisualShift|null>(null)
 useEffect(()=>{
  let closed=false;let timer:ReturnType<typeof setTimeout>
  async function poll(){try{
   const response=await fetch('/multi-api/local-real/'+encodeURIComponent(token));const body=await response.json()
   if(!response.ok)throw new Error(body.detail??'读取失败')
   if(!closed){setData(body);setError('');if(body.status==='RUNNING')timer=setTimeout(poll,2000)}
  }catch(e){if(!closed){setError(String(e));timer=setTimeout(poll,5000)}}}
  void poll();return()=>{closed=true;clearTimeout(timer)}
 },[token])
 const names=new Map(data?.employees.map(e=>[e.id,e.name])??[])
 const accepted=data?.result?.assignments??data?.preview_assignments??[]
 const assignments:VisualShift[]=accepted.map(s=>({...s,employee_name:names.get(s.employee_id)??s.employee_id,breaks:[],reasons:[s.reason]}))
 const coverage=data?.result?.validation.coverage??data?.preview_coverage??[]
 const slots:VisualSlot[]=coverage.map(s=>({...s,effective:s.scheduled,on_break:0,gap:Math.max(0,-s.difference)}))
 const failures=data?.result?.failed_days??data?.events.filter(e=>e.kind==='DAY_FAILED').map(e=>({date:e.date!,reason:'未通过',errors:[]}))??[]
 const commits=data?.events.filter(e=>e.kind==='COMMITTED'&&e.date).map(e=>e.date)??[]
 const active=data?.events.filter(e=>e.kind==='AGENT_RUNNING').at(-1)
 const labels:Record<string,string>={requirement:'理解真实门店需求',daily:'安排真实员工班次',review:'记录未排员工（公平性关闭）',audit:'最终覆盖与资格审计'}
 const days=data?.result?Array.from(new Set(coverage.map(s=>s.date))).sort():[]
 const timezone=data?.timezone??'Australia/Sydney'
 return <div className="ma-app"><header className="ma-header"><div><a href="http://127.0.0.1:4188/">← CP-SAT Scheduling Lab</a><h1>Hurstville · 真实员工竖版班表</h1><p>{data?.start_date} 至 {data?.end_date} · 数据库实时读取 · {data?.allocation_report?'评分比例目标 + 指定员工晚班':'公平性关闭'}</p></div><span className="ma-badge">只读测试草稿</span></header>
 <main className="ma-main">{error&&<div className="ma-error" role="alert">{error}</div>}
 <section className="ma-section"><div className="ma-title"><h2>{data?.status==='RUNNING'?'真实 LLM 正在排班':data?.result?.validation.valid?'全周验证通过':'部分日期未通过，全周不可发布'}</h2><span role="status" aria-live="polite">{data?.status??'读取真实结果…'}</span></div>
 <p>{data?.provenance.employee_count??'—'} 名现有员工 · {data?.provenance.availability_count??'—'} 个报班可用区间 · {assignments.length} 个已接受班次 · {assignments.filter(s=>s.pattern_name==='Full').length} 个 Full</p>
 <p className="ma-muted">读取时间：{data?new Date(data.provenance.fetched_at).toLocaleString('zh-CN',{timeZone:timezone}):'—'}（悉尼）。使用现有正式评分、岗位资格和 Availability。评分优先，不做工时平均分配。</p>
 {data?.status==='RUNNING'&&<p role="status">{active?labels[active.agent??'']:'读取数据'} {active?.date??''}。已完成：{commits.join('、')||'等待首日验证'}。</p>}
 <p className="ma-muted">目标周已发布班次只在本次内存对照中分离，数据库原班表不变。休息尚未自动安排，覆盖为名义人数。</p>
 </section>
 {data?.allocation_report&&<section className="ma-section"><div className="ma-title"><h2>评分与报班工时目标</h2><span>{data.allocation_report.rule_version}</span></div>
 {data.allocation_report.rating_policy&&<p>最高分员工目标 {(data.allocation_report.rating_policy.highest_score_fraction*100).toFixed(0)}%；其余员工按档位计算：{data.allocation_report.rating_policy.bands.map((b,i,bands)=>`${i===0?'≥'+b.minimum_score:b.minimum_score===0?'低于'+bands[i-1].minimum_score:b.minimum_score+'–<'+bands[i-1].minimum_score} 分 ${(b.fraction*100).toFixed(0)}%`).join('；')}。无正式评分不编造目标。</p>}
 <p className="ma-muted">按本次日期范围内合并去重后的报班可用时长计算，排除批准休假。比例是分配软目标；精确覆盖、Availability、岗位资格及指定员工晚班优先，不要求人人相同工时。</p>
 {data.allocation_report.rows.some(r=>r.target_exceeds_individual_capacity)&&<p className="ma-notice">部分目标高于员工在现有班型、岗位资格和每日班次数限制下的个人候选容量上界：{data.allocation_report.rows.filter(r=>r.target_exceeds_individual_capacity).map(r=>`${r.employee_name} 目标 ${((r.target_scheduled_minutes??0)/60).toFixed(2)}h，上界 ${((r.maximum_candidate_minutes??0)/60).toFixed(2)}h`).join('；')}。该上界也不保证全店覆盖可同时满足。</p>}
 <p>全周目标合计 {(data.allocation_report.total_rated_target_minutes/60).toFixed(2)} 小时；完整一周精确覆盖需要 {(data.allocation_report.required_coverage_minutes/60).toFixed(2)} 小时。{data.allocation_report.total_rated_target_minutes<data.allocation_report.required_coverage_minutes?'目标合计不足以覆盖全部需求，不能把这些比例同时作为硬上限。':''}</p>
 <div className="ma-scroll"><table><thead><tr><th>员工</th><th>正式评分</th><th>报班小时</th><th>目标比例</th><th>目标小时</th><th>已排小时</th><th>实际比例</th><th>实际 − 目标</th></tr></thead><tbody>{data.allocation_report.rows.map(r=><tr key={r.employee_id}><td>{r.employee_name}</td><td>{r.rating??'未知'}</td><td>{(r.available_minutes/60).toFixed(2)}</td><td>{r.target_fraction!==null?(r.target_fraction*100).toFixed(0)+'%':'未设目标'}</td><td>{r.target_scheduled_minutes!==null?(r.target_scheduled_minutes/60).toFixed(2):'—'}</td><td>{(r.target_assigned_minutes/60).toFixed(2)}</td><td>{r.actual_fraction!==null?(r.actual_fraction*100).toFixed(1)+'%':'无报班'}</td><td>{r.difference_minutes!==null?(r.difference_minutes>0?'+':'')+(r.difference_minutes/60).toFixed(2):'—'}</td></tr>)}</tbody></table></div>
 <h3>指定员工晚班 · 必须覆盖完整时段</h3><p className="ma-muted">具备资格且覆盖完整晚班的 Full 也算满足；不能用 17:00 结束的早班代替。</p>
 <div className="ma-scroll"><table><thead><tr><th>日期</th><th>员工</th><th>必须覆盖</th><th>实际班次</th><th>校验</th></tr></thead><tbody>{data.allocation_report.mandatory_coverage.map(r=><tr key={r.date+r.employee_id}><td>{r.date}</td><td>{r.employee_name}</td><td>{r.start}–{r.end}</td><td>{r.shifts.map(s=>`${s.pattern_name} ${formatClock(s.start,timezone)}–${formatClock(s.end,timezone)}`).join('、')||'尚无已接受班次'}</td><td>{r.satisfied?'✓ 已满足':data.status==='RUNNING'?'待排':'未满足'}</td></tr>)}</tbody></table></div>
 </section>}
 {failures.length>0&&<section className="ma-section"><h2>未通过日期与缺口</h2>{failures.map(f=><div className="ma-error" key={f.date}><strong>{f.date} · {f.reason==='PROVEN_SOURCE_SHORTAGE'?'数据库报班或资格无法满足人数':'当日排班未通过校验'}</strong>
 {f.errors.length>0&&<p>{f.errors[0].message??(f.errors[0].start?`${formatClock(f.errors[0].start,timezone)} 起需要 ${f.errors[0].required} 人，合格且可用最多 ${f.errors[0].eligible_employee_ids?.length??0} 人。`:'详见执行记录。')}</p>}
 {data?.source_diagnostics?.find(d=>d.date===f.date)?.proven_slot_conflicts.filter(e=>e.message).map((e,i)=><p key={i}>{e.message}</p>)}
 <p>本日没有已接受班次；下方保留真实缺口，不用测试员工补位。</p></div>)}</section>}
 <section className="ma-section"><div className="ma-title"><h2>竖版班表</h2><div className="ma-actions" style={{margin:0}}><button onClick={()=>setWeek(true)} aria-pressed={week}>全周竖版</button><button onClick={()=>setWeek(false)} aria-pressed={!week}>单日竖版</button>{days.length>0&&<label>日期<select value={day} onChange={e=>{setDay(e.target.value);setWeek(false)}}>{days.map(d=><option key={d}>{d}</option>)}</select></label>}</div></div>
 {data&&<ScheduleViews assignments={assignments} coverage={slots} timezone={timezone} startDate={data.start_date} endDate={data.end_date} week={week} selectedDate={day} showEffective={false} onDateChange={setDay} onSelect={setSelected}/>}
 {selected&&<div className="ma-review"><h3>{selected.employee_name} · {selected.pattern_name}</h3><p>{formatClock(selected.start,timezone)}–{formatClock(selected.end,timezone)}</p>{selected.reasons.map((s,i)=><p key={i}>{s}</p>)}</div>}</section>
 {coverage.length>0&&<section className="ma-section"><h2>{day} · 每半小时覆盖</h2><div className="ma-scroll ma-coverage"><table><thead><tr><th>时间</th><th>需要人数</th><th>名义覆盖</th><th>差异</th><th>员工</th></tr></thead><tbody>{coverage.filter(s=>s.date===day).map(s=><tr key={s.start}><td>{formatClock(s.start,timezone)}–{formatClock(s.end,timezone)}</td><td>{s.required}</td><td>{s.scheduled}</td><td>{s.difference}</td><td>{s.employee_ids.map(id=>names.get(id)??id).join('、')}</td></tr>)}</tbody></table></div></section>}
 {data?.result&&!data.allocation_report&&<details className="ma-section"><summary>员工评分与已接受工时（只记录，不用于公平分配）</summary><div className="ma-scroll"><table><thead><tr><th>员工</th><th>正式评分</th><th>班次</th><th>名义小时</th></tr></thead><tbody>{data.result.ledger.employees.map(e=><tr key={e.employee_id}><td>{names.get(e.employee_id)}</td><td>{e.rating??'无有效正式评分'}</td><td>{e.shift_count}</td><td>{(e.total_scheduled_minutes/60).toFixed(1)}</td></tr>)}</tbody></table></div></details>}
 </main></div>
}
