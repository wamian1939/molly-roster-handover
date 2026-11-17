import React, {useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ScheduleViews, type VisualShift, type VisualSlot} from '../ScheduleViews'
import {formatClock} from '../timeDisplay'
import '../style.css'
import './style.css'
import {RealResultApp} from './RealResultApp'

type Employee={id:string;name:string;score:number|null}
type Hours={employee_id:string;rating:number|null;total_scheduled_minutes:number;shift_count:number;remaining_hours_capacity:number|null;total_paid_minutes:null}
type Ledger={version:number;employees:Hours[]}
type Slot={date:string;start:string;end:string;required:number;scheduled:number;difference:number;employee_ids:string[]}
type Assignment={id:string;employee_id:string;date:string;pattern_name:string;role_code:string;start:string;end:string;fixed:boolean;reason:string}
type Event={sequence:number;kind:string;agent?:string;date?:string;status?:string;ledger?:Ledger;errors?:unknown;usage?:{input_tokens:number;output_tokens:number;cost_usd:number|null};report?:{valid:boolean;errors:unknown[]}}
type Result={status:string;provider:string;source:string;rule_version:string;snapshot_version:string;state_version:number;publishable:false;assignments:Assignment[];ledger:Ledger;validation:{valid:boolean;errors:{code:string;message:string}[];coverage:Slot[]};review:{analysis:string;unassigned_employee_ids:string[];low_hours_employee_ids:string[];replacements:unknown[];retain_reasons:string[]}|null}
type Run={status:string;events:Event[];result:Result|null;history:{date:string;ledger:Ledger}[]}
type Preview={rules:{version:string;timezone:string;enforce_work_rest_limits:boolean};context:{days:{date:string;opening_count:number;coverage:{start:string;end:string;staff:number}[]}[]};snapshot_version:string;source:string;rating_source:string;employees:Employee[];availability_count:number;existing_shift_count:number}

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:'include',...options})
  const data=await response.json()
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail??data))
  return data as T
}

function App(){
  const [source,setSource]=useState('MOCK'),[store,setStore]=useState('hurstville')
  const [start,setStart]=useState('2026-10-26'),[end,setEnd]=useState('2026-11-01'),[scenario,setScenario]=useState('balanced')
  const [preview,setPreview]=useState<Preview|null>(null),[run,setRun]=useState<Run|null>(null),[runId,setRunId]=useState('')
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[configured,setConfigured]=useState(false)
  const [rating,setRating]=useState(2),[fairness,setFairness]=useState(1),[preference,setPreference]=useState(1)
  const [weeklyCap,setWeeklyCap]=useState('38'),[repairs,setRepairs]=useState(5)
  const [day,setDay]=useState(start),[ledgerIndex,setLedgerIndex]=useState(-1),[selected,setSelected]=useState<VisualShift|null>(null)
  const sequence=useRef(0)
  const running=run?.status==='RUNNING'
  useEffect(()=>{request<{provider_configured:boolean}>('/multi-api/health').then(h=>setConfigured(h.provider_configured)).catch(e=>setError(String(e)))},[])
  useEffect(()=>{sequence.current++;setPreview(null);setError('')},[source,store,start,end,scenario])
  useEffect(()=>{
    if(!runId||!running)return
    let cancelled=false
    let timer:ReturnType<typeof setTimeout>
    const poll=async()=>{
      try{
        const next=await request<Run>(`/multi-api/runs/${runId}`)
        if(!cancelled){setRun(next);if(next.status==='RUNNING')timer=setTimeout(poll,2000)}
      }catch(e){if(!cancelled){setError(String(e));timer=setTimeout(poll,5000)}}
    }
    void poll()
    return()=>{cancelled=true;clearTimeout(timer)}
  },[runId,running])
  async function load(){
    const token=++sequence.current
    setBusy(true);setError('')
    try{
      const params=new URLSearchParams({source,store_id:store,start_date:start,end_date:end,scenario})
      const data=await request<Preview>('/multi-api/inputs?'+params)
      if(token===sequence.current){setPreview(data);setDay(start)}
    }catch(e){if(token===sequence.current)setError(String(e))}
    finally{setBusy(false)}
  }
  async function generate(){
    if(!preview)return
    setBusy(true);setError('');setSelected(null)
    try{
      const data=await request<{run_id:string}>('/multi-api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        source,store_id:store,start_date:start,end_date:end,scenario,expected_rule_version:preview.rules.version,
        expected_snapshot_version:preview.snapshot_version,policy:{rating_weight:rating,fairness_weight:fairness,preference_weight:preference,
          max_repairs:repairs,weekly_cap_minutes:weeklyCap?Number(weeklyCap)*60:null}})})
      setRunId(data.run_id);setRun({status:'RUNNING',events:[],result:null,history:[]});setLedgerIndex(-1)
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  async function download(){
    try{
      const data=await request(`/multi-api/runs/${runId}/export`)
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
      const link=document.createElement('a');link.href=url;link.download=`multi-agent-draft-${runId}.json`;link.click();URL.revokeObjectURL(url)
    }catch(e){setError(String(e))}
  }
  async function loadExample(){
    setBusy(true);setError('')
    try{
      const data=await request<{run_id:string;run:Run;preview:Preview}>('/multi-api/examples/synthetic-week',{method:'POST'})
      setRunId(data.run_id);setRun(data.run);setPreview(data.preview);setDay(start);setLedgerIndex(-1)
      setWeeklyCap('38')
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const result=run?.result, events=run?.events??[]
  const names=new Map(preview?.employees.map(e=>[e.id,e.name])??[])
  const history=run?.history.length?run.history:events.filter(e=>e.kind==='COMMITTED'&&e.ledger).map(e=>({date:e.date??'REVIEW',ledger:e.ledger!}))
  const ledger=ledgerIndex>=0?history[ledgerIndex]?.ledger:result?.ledger??history.at(-1)?.ledger
  const previousLedger=ledgerIndex>0?history[ledgerIndex-1]?.ledger:null
  const assignments:VisualShift[]=(result?.assignments??[]).map(s=>({...s,employee_name:names.get(s.employee_id)??s.employee_id,breaks:[],reasons:[s.reason]}))
  const slots=result?.validation.coverage??[]
  const visualSlots:VisualSlot[]=slots.map(s=>({...s,on_break:0,effective:s.scheduled,gap:Math.max(0,-s.difference)}))
  const usage=events.filter(e=>e.usage).map(e=>e.usage!)
  const timezone=preview?.rules.timezone??'Australia/Sydney'
  const agentLabel:Record<string,string>={requirement:'需求理解',daily:'逐日排班',review:'遗漏员工审查',audit:'最终审计'}
  return <div className="ma-app"><header className="ma-header"><div><a href="http://127.0.0.1:4188/">← Scheduling Lab / 规则编辑器</a><h1>Multi-Agent 排班测试</h1><p>逐日选人 · 验证后提交 · 累计工时可追溯</p></div><span className="ma-badge">独立草稿环境</span></header>
    <main className="ma-main"><div className="ma-notice"><strong>名义覆盖验证，休息与合规待处理。</strong> Full 按一个完整班次计时。当前未实现自动休息安排，有薪工时未知，所有结果均不可自动发布。</div>
      {error&&<div className="ma-error" role="alert">{error}</div>}
      <section className="ma-section" aria-labelledby="input-title"><h2 id="input-title">排班输入</h2><div className="ma-fields">
        <label>门店 ID<input value={store} onChange={e=>setStore(e.target.value)} disabled={running}/></label>
        <label>员工数据<select value={source} onChange={e=>{setSource(e.target.value);setWeeklyCap(e.target.value==='MOCK'?'38':'')}} disabled={running}><option value="MOCK">合成员工 · 实际 Hurstville 规则</option><option value="REAL">真实 Snapshot · 需要 Evaluate 登录</option></select></label>
        <label>开始日期<input type="date" value={start} onChange={e=>setStart(e.target.value)} disabled={running}/></label>
        <label>结束日期<input type="date" value={end} onChange={e=>setEnd(e.target.value)} disabled={running}/></label>
        {source==='MOCK'&&<label>测试场景<select value={scenario} onChange={e=>setScenario(e.target.value)} disabled={running}><option value="balanced">评分差异与充分 Availability</option><option value="staff_shortage">员工不足</option><option value="skill_shortage">岗位资格不足</option><option value="availability_conflict">Availability 冲突</option></select></label>}
      </div><div className="ma-actions"><button onClick={()=>void load()} disabled={busy||running}>{busy?'读取中…':'读取并预览输入'}</button>{source==='MOCK'&&store==='hurstville'&&start==='2026-10-26'&&end==='2026-11-01'&&scenario==='balanced'&&<button onClick={()=>void loadExample()} disabled={busy||running}>载入已运行的全周样例</button>}<span>{configured?'LLM Provider 已配置':'LLM Provider 尚未配置，请设置环境变量'}</span></div>
      {preview&&<div className="ma-input-summary"><p><strong>{preview.rules.version}</strong> · {preview.rules.timezone} · {preview.employees.length} 名员工 · {preview.availability_count} 个可用区间 · {preview.existing_shift_count} 条既有班次</p><p>评分来源：{preview.rating_source}</p><p>Snapshot：<code>{preview.snapshot_version}</code></p><p>原 RuleSet 数值工时限制：{preview.rules.enforce_work_rest_limits?'启用':'关闭，可在下方为本次运行设置名义周上限'}</p><div className="ma-scroll"><table><thead><tr><th>日期</th><th>开早（包含 Full）</th><th>精确时段人数</th></tr></thead><tbody>{preview.context.days.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.opening_count}</td><td>{d.coverage.map(b=>`${b.start}–${b.end}：${b.staff}`).join('　')}</td></tr>)}</tbody></table></div></div>}
      <details className="ma-options"><summary>本次运行的评分、公平性和限制</summary><div className="ma-fields">
        <label>评分权重<input type="number" min="0" max="100" value={rating} onChange={e=>setRating(Number(e.target.value))} disabled={running}/></label><label>累计工时权重<input type="number" min="0" max="100" value={fairness} onChange={e=>setFairness(Number(e.target.value))} disabled={running}/></label><label>偏好权重<input type="number" min="0" max="100" value={preference} onChange={e=>setPreference(Number(e.target.value))} disabled={running}/></label>
        <label>名义周上限（小时，可留空）<input type="number" min="1" value={weeklyCap} onChange={e=>setWeeklyCap(e.target.value)} disabled={running}/></label><label>每阶段最大修复次数<input type="number" min="0" max="10" value={repairs} onChange={e=>setRepairs(Number(e.target.value))} disabled={running}/></label>
      </div><p className="ma-muted">合成场景默认使用 38 小时测试上限；切换真实来源后清空，由本次运行显式配置。该设置不代表法定上限或已确认生产规则。</p></details><div className="ma-actions"><button className="ma-primary" onClick={()=>void generate()} disabled={!preview||!configured||busy||running}>{running?'四 Agent 正在执行…':'运行四 Agent 排班'}</button><span>每次运行使用真实 LLM，合成场景仅替换员工数据。</span></div></section>
      <section className="ma-section"><div className="ma-title"><h2>执行过程</h2><span role="status" aria-live="polite">{run?.status??'等待开始'}</span></div><ol className="ma-agent-list">{Object.entries(agentLabel).map(([agent,label])=>{
        const last=events.filter(e=>e.agent===agent).at(-1)
        const state=last?.kind==='AGENT_COMPLETED'?'完成':last?.kind==='REPAIR_ROUTED'?'同日修复':last?.kind==='AGENT_RUNNING'?'执行中':last?'已返回':'等待'
        return <li key={agent}><strong>{label}</strong><span>{state}{last?.date?' · '+last.date:''}</span></li>
      })}</ol>{usage.length>0&&<p className="ma-muted">{usage.reduce((a,b)=>a+b.input_tokens,0).toLocaleString()} 输入 Token · {usage.reduce((a,b)=>a+b.output_tokens,0).toLocaleString()} 输出 Token · 费用：{usage.every(u=>u.cost_usd!==null)?'$'+usage.reduce((a,u)=>a+(u.cost_usd??0),0).toFixed(4)+'（配置费率估算）':'未知（尚未配置 Provider 费率）'}</p>}
      {events.length>0&&<details><summary>查看验证与修复日志（{events.length} 条）</summary><div className="ma-log">{events.filter(e=>!['AGENT_OUTPUT','INITIAL_LEDGER'].includes(e.kind)).map(e=><div key={e.sequence}><code>v{e.kind==='COMMITTED'?e.ledger?.version:'—'} {e.kind}</code> {e.agent} {e.date} {e.status}{e.report&&!e.report.valid&&<pre>{JSON.stringify(e.report.errors,null,2)}</pre>}{e.errors!==undefined&&<pre>{JSON.stringify(e.errors,null,2)}</pre>}</div>)}</div></details>}</section>
      {result?.status==='FAILED'&&<section className="ma-section ma-error" role="alert"><h2>本次排班未通过</h2>{result.validation.errors.map((e,i)=><p key={i}><strong>{e.code}</strong> {e.message}</p>)}<p>已接受日期保留在运行记录中，JSON 草稿导出已禁用。</p></section>}
      <section className="ma-section"><div className="ma-title"><h2>每日工时与公平性</h2><label>查看台账<select value={ledgerIndex} onChange={e=>setLedgerIndex(Number(e.target.value))}><option value={-1}>最新权威台账</option>{history.map((h,i)=><option key={i} value={i}>{h.date} · v{h.ledger.version}</option>)}</select></label></div>
      {!ledger?<p className="ma-muted">每天验证通过后，这里会显示员工评分、累计工时和剩余容量。</p>:<div className="ma-scroll"><table><thead><tr><th>员工</th><th>现有评分</th><th>班次数</th><th>累计名义小时</th><th>本次增量</th><th>剩余容量</th><th>状态</th></tr></thead><tbody>{ledger.employees.map(r=>{const before=previousLedger?.employees.find(e=>e.employee_id===r.employee_id)?.total_scheduled_minutes??0;return <tr key={r.employee_id}><td>{names.get(r.employee_id)??r.employee_id}</td><td>{r.rating??'未知'}</td><td>{r.shift_count}</td><td>{(r.total_scheduled_minutes/60).toFixed(1)}</td><td>{ledgerIndex>=0?((r.total_scheduled_minutes-before)/60).toFixed(1):'—'}</td><td>{r.remaining_hours_capacity??'未配置上限'}</td><td>{r.total_scheduled_minutes===0?'未排班':r.total_scheduled_minutes<600?'低工时':'已排班'}</td></tr>})}</tbody></table></div>}
      {result?.review&&<div className="ma-review"><h3>遗漏员工审查结论</h3><p>{result.review.analysis}</p>{result.review.retain_reasons.map((r,i)=><p key={i}>{r}</p>)}</div>}</section>
      {result&&<section className="ma-section"><div className="ma-title"><h2>{result.status==='DRAFT_VALIDATED'?'已验证草稿日历':'已接受的部分班次'}</h2><button onClick={()=>void download()} disabled={result.status!=='DRAFT_VALIDATED'}>导出 JSON 草稿</button></div><label>查看日期<select value={day} onChange={e=>setDay(e.target.value)}>{preview?.context.days.map(d=><option key={d.date}>{d.date}</option>)}</select></label>
        <ScheduleViews assignments={assignments} coverage={visualSlots} timezone={timezone} startDate={start} endDate={end} week={false} selectedDate={day} onDateChange={setDay} onSelect={setSelected}/>
        {selected&&<div className="ma-review"><h3>{selected.employee_name} · {selected.pattern_name}</h3><p>{formatClock(selected.start,timezone)}–{formatClock(selected.end,timezone)}</p>{selected.reasons.map((r,i)=><p key={i}>{r}</p>)}</div>}
      </section>}
      {slots.length>0&&<section className="ma-section"><h2>Coverage · 每 30 分钟的名义覆盖</h2><div className="ma-scroll ma-coverage"><table><thead><tr><th>时间</th><th>需要</th><th>实际</th><th>差异</th><th>覆盖员工</th></tr></thead><tbody>{slots.filter(s=>s.date===day).map(s=><tr key={s.start}><td>{formatClock(s.start,timezone)}–{formatClock(s.end,timezone)}</td><td>{s.required}</td><td>{s.scheduled}</td><td>{s.difference===0?'✓ 0':s.difference}</td><td>{s.employee_ids.map(id=>names.get(id)??id).join('、')}</td></tr>)}</tbody></table></div></section>}
    </main></div>
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('real')?<RealResultApp/>:<App/> )
