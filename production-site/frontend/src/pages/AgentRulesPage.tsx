import { DateTime } from 'luxon';
import { Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppSelect } from '../components/ui/AppSelect';
import { workforceRepository } from '../services/workforceRepository';
import { multiAgentRepository as api,type AgentRuleSettings,type AgentRuleWeek } from '../services/multiAgentRepository';
import { useStoreSelection } from '../store/StoreContext';
import type {RosterStore} from '../types/workforce';
import './multiAgent.css';
import './agentRules.css';

const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'请求失败，请重试';
export function AgentRulesPage(){
  const {user}=useAuth();const {selectedStoreId,setSelectedStoreId,initializeStoreId}=useStoreSelection();
  const [stores,setStores]=useState<RosterStore[]>([]);const [error,setError]=useState('');
  useEffect(()=>{let active=true;workforceRepository.stores().then(({stores:rows})=>{if(active){setStores(rows);initializeStoreId(rows.map(s=>s.id));}}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[initializeStoreId]);
  return <div className="agent-page agent-rules-page"><header className="rule-page-header"><div><h1 className="text-2xl font-bold text-graphite-950">智能体规则设置</h1><p className="mt-2 text-sm text-graphite-600">设置每天各时段需要多少人，排班在日历里直接生成和保存。</p></div><div className="rule-store-select"><AppSelect label="门店" value={selectedStoreId} onValueChange={setSelectedStoreId} options={stores.map(s=>({value:s.id,label:s.name}))}/></div></header>
    {error&&<p role="alert" className="agent-notice agent-error">{error}</p>}
    {selectedStoreId?<RuleEditor key={`${user?.accountId}:${selectedStoreId}`} storeId={selectedStoreId}/>:<p role="status">正在读取门店…</p>}
  </div>;
}
function RuleEditor({storeId}:{storeId:string}){
  const [query]=useSearchParams();
  const [week,setWeek]=useState(()=>{const requested=DateTime.fromISO(query.get('week')??'');return(requested.isValid?requested:DateTime.now().setZone('Australia/Sydney')).startOf('week').toISODate()!;});
  const [settings,setSettings]=useState<AgentRuleSettings|null>(null);const [weekly,setWeekly]=useState<AgentRuleWeek>({});
  const [scope,setScope]=useState<'DEFAULT'|'WEEK'>('DEFAULT');const [error,setError]=useState('');const [success,setSuccess]=useState('');const [busy,setBusy]=useState(false);const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;api.rules(storeId,week).then(s=>{if(active){setSettings(s);setWeekly(s.weekly);setScope(s.effective_scope);setError('');}}).catch(e=>{if(active){setSettings(null);setError(errorMessage(e));}});return()=>{active=false;};},[storeId,week,revision]);
  function change(day:number,index:number,key:'start'|'end'|'staff',value:string){setWeekly(current=>({...current,[day]:current[day].map((b,i)=>i===index?{...b,[key]:key==='staff'?Number(value):value}:b)}));setSuccess('');}
  async function save(){
    if(!settings)return;setBusy(true);setError('');setSuccess('');
    try{const result=await api.saveRules({storeId,scope,weekStart:scope==='WEEK'?week:null,expectedVersion:scope==='WEEK'?settings.week_version:settings.default_version,baseRuleVersion:settings.base_rule_version,weekly});
      if(result.saved!==true||result.store_id!==storeId||result.scope!==scope||result.version!==(scope==='WEEK'?settings.week_version:settings.default_version)+1)throw new Error('规则保存响应不一致，请重新读取核对');
      setSuccess(`${scope==='WEEK'?'仅本周':'固定'}规则已保存，版本 ${result.version}`);setRevision(v=>v+1);
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  return <>
    <section className="agent-section rule-controls"><div className="rule-section-heading"><div><h2 className="agent-heading">规则与排班周</h2><p>先选择排班周和生效范围，再编辑下方人数。</p></div><span className="rule-scope-badge">{scope==='WEEK'?'正在编辑本周临时规则':'正在编辑每周固定规则'}</span></div>
      <div className="rule-control-row"><label className="rule-week-field"><span className="rule-field-label">查看排班周</span><input className="agent-input" type="date" value={week} disabled={busy} onChange={e=>{const d=DateTime.fromISO(e.target.value);if(d.isValid){setWeek(d.startOf('week').toISODate()!);setSettings(null);setSuccess('');}}}/></label>
      <div className="rule-scope-field"><AppSelect label="规则生效范围" value={scope} disabled={!settings||busy} onValueChange={v=>{const next=v as 'DEFAULT'|'WEEK';setScope(next);if(settings)setWeekly(next==='DEFAULT'?settings.default_weekly:(settings.week_weekly??settings.default_weekly));setSuccess('');}} options={[{value:'DEFAULT',label:'固定规则：每周重复'},{value:'WEEK',label:'临时规则：仅本周'}]}/></div>
      <div className="rule-control-actions">
      <button className="agent-primary" disabled={!settings||busy} onClick={()=>void save()}>{busy?'正在保存…':'保存排班规则'}</button>
      <Link className="agent-secondary" to={`/calendar?store=${encodeURIComponent(storeId)}&date=${week}&view=timeGridWeek&agent=1`}>到日历生成班表<ArrowUpRight size={16} aria-hidden="true"/></Link></div></div>
      <p className="rule-scope-note">{scope==='WEEK'?`仅 ${week} 所在周生效，之后自动使用固定规则。`:'固定规则每周复用；若某周有临时规则，该周以临时版本为准。'}</p>
      {settings&&<details className="rule-metadata"><summary>查看规则版本与时区</summary><dl><div><dt>基础规则</dt><dd>{settings.base_rule_version}</dd></div><div><dt>当前生效版本</dt><dd>{settings.effective_rule_version}</dd></div><div><dt>门店时区</dt><dd>{settings.timezone}</dd></div></dl></details>}
      {settings?.needs_review&&<p role="alert" className="agent-notice agent-error mt-3">基础门店规则已变化。请核对这里的人数并保存新版本，之后才能用它生成班表。</p>}
    </section>
    {error&&<p role="alert" className="agent-notice agent-error">{error}<button className="agent-secondary ml-3" onClick={()=>setRevision(v=>v+1)}>重新读取规则</button></p>}
    {success&&<p role="status" className="agent-notice">{success}</p>}
    {settings?<section className="agent-section rule-coverage"><div className="rule-section-heading"><div><h2 className="agent-heading">每日精确覆盖人数</h2><p>每行设置一个完整时段，系统按半小时检查覆盖人数。</p></div><span className="rule-week-label">{DateTime.fromISO(week).toFormat('M月d日')} — {DateTime.fromISO(week).plus({days:6}).toFormat('M月d日')}</span></div>
      <p className="rule-coverage-note">开早人数已包含在首时段人数中，不额外增加员工。Full 可覆盖开早、早班和晚班；班型与岗位资格沿用门店配置。</p>
      <div className="rule-week-grid">{weekdays.map((name,day)=><section key={day} className="rule-day" aria-labelledby={`rule-day-${day}`}><header><h3 id={`rule-day-${day}`}>{name}</h3><span>{(weekly[day]??[]).length} 个时段</span></header><div className="rule-day-bands">{(weekly[day]??[]).map((band,index)=><div key={index} className="rule-band-row">
        <label><span>开始时间</span><input aria-label={`${name}时段${index+1}开始`} className="agent-input" type="time" step={1800} value={band.start} disabled={busy} onChange={e=>change(day,index,'start',e.target.value)}/></label>
        <label><span>结束时间</span><input aria-label={`${name}时段${index+1}结束`} className="agent-input" type="time" step={1800} value={band.end} disabled={busy} onChange={e=>change(day,index,'end',e.target.value)}/></label>
        <label><span>需要人数</span><input aria-label={`${name}时段${index+1}人数`} className="agent-input" type="number" min={0} max={100} value={band.staff} disabled={busy} onChange={e=>change(day,index,'staff',e.target.value)}/></label>
        <button className="agent-secondary rule-remove-band" title={`移除${name}时段${index+1}`} aria-label={`删除${name}时段${index+1}`} disabled={busy||weekly[day].length===1} onClick={()=>setWeekly(s=>({...s,[day]:s[day].filter((_,i)=>i!==index)}))}><Trash2 size={16} aria-hidden="true"/><span>移除</span></button>
      </div>)}</div><button className="agent-secondary rule-add-band" disabled={busy} onClick={()=>setWeekly(s=>{const last=s[day].at(-1)!;const end=DateTime.fromISO('2000-01-01T'+last.end).plus({minutes:30}).toFormat('HH:mm');return{...s,[day]:[...s[day],{start:last.end,end,staff:last.staff}]};})}><Plus size={16} aria-hidden="true"/>添加{name}时段</button></section>)}</div>
      {settings.business_rules?.mandatory_coverage.map(r=><p key={r.label} className="mt-5 text-sm text-graphite-700">固定员工条件：{r.label}</p>)}
      <p className="mt-3 text-sm text-graphite-600">评分对应报班小时比例继续生效，公平性分配保持关闭。人数规则不会改变员工 Availability 或岗位资格。</p>
    </section>:!error&&<p role="status" className="agent-section">正在读取门店规则…</p>}
  </>;
}
