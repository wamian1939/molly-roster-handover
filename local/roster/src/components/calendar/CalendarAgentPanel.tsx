import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { addCalendarDays } from '../../lib/storeTime';
import { multiAgentRepository as api,type AgentRun } from '../../services/multiAgentRepository';
import {AgentRunProgress} from './AgentRunProgress';
import '../../pages/multiAgent.css';

function recall(key:string){try{return sessionStorage.getItem(key)??'';}catch{return '';}}
function remember(key:string,id:string){try{sessionStorage.setItem(key,id);}catch{/* The backend also tracks the task. */}}
export function CalendarAgentPanel({storeId,weekStart,visible,disabled,onApplied,onShowWeek}:{storeId:string;weekStart:string;visible:boolean;disabled:boolean;onApplied:()=>Promise<void>;onShowWeek?:(date:string)=>void}){
  const {user}=useAuth();const key=`roster:calendar-agent:${user?.accountId}:${storeId}:${weekStart}`;
  const [runId,setRunId]=useState(()=>recall(key));const [state,setState]=useState<AgentRun|null>(null);
  const [taskRange,setTaskRange]=useState({from:weekStart,to:addCalendarDays(weekStart,6)});
  const [busy,setBusy]=useState('');const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const [recent,setRecent]=useState<{run_id:string;start_date:string;end_date:string}|null>(null);
  const starting=useRef(false);const startedHere=useRef(false);const applied=useRef('');const end=addCalendarDays(weekStart,6);
  const running=state?.status==='RUNNING'||state?.calendar_write?.status==='PENDING';
  const blocked=disabled||running||Boolean(busy);
  const errorMessage=(e:unknown)=>e instanceof Error?e.message:'请求失败，请重试';
  useEffect(()=>{
    if(!api.recentRun)return;let active=true;
    api.recentRun(storeId).then(({run})=>{
      if(!active||!run||starting.current||startedHere.current)return;setRecent(run);
      remember(`roster:calendar-agent:${user?.accountId}:${storeId}:${run.start_date}`,run.run_id);
      setTaskRange({from:run.start_date,to:run.end_date});setRunId(run.run_id);
    }).catch(()=>{/* Starting a task reports service errors. */});
    return()=>{active=false;};
  },[storeId,weekStart,user?.accountId]);
  useEffect(()=>{
    if(!runId)return;let active=true;let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{const result=await api.status(storeId,runId);if(!active)return;setState(result);setError('');
        if(result.calendar_write?.status==='APPLIED'&&applied.current!==runId){applied.current=runId;await onApplied();}
        if(active&&(result.status==='RUNNING'||result.calendar_write?.status==='PENDING'))timer=setTimeout(()=>{void poll();},1500);
      }catch(e){if(active){setError(errorMessage(e));timer=setTimeout(()=>{void poll();},5000);}}
    }
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[storeId,runId,onApplied,retry]);
  async function start(){
    if(blocked||starting.current)return;starting.current=true;setBusy('inputs');setError('');
    try{
      const inputs=await api.inputs(storeId,weekStart,end,false);
      setBusy('start');const result=await api.start(storeId,weekStart,end,false,inputs,true);
      startedHere.current=true;remember(key,result.run_id);setTaskRange({from:weekStart,to:end});setRunId(result.run_id);
      setState({status:'RUNNING',result:null,events:[],history:[],calendar_write:{status:'PENDING'}});
    }catch(e){setError(errorMessage(e));}finally{starting.current=false;setBusy('');}
  }
  async function retryApply(){setBusy('apply');setError('');try{await api.apply(storeId,runId);setRetry(v=>v+1);}catch(e){setError(errorMessage(e));}finally{setBusy('');}}
  const writes=state?.calendar_write;
  const progressFrom=state?.start_date??taskRange.from;
  const progressTo=state?.end_date??taskRange.to;
  return <section className="agent-page mb-4" hidden={!visible} style={visible?undefined:{display:'none'}} aria-label="日历智能体排班"><div className="agent-section">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="agent-heading">智能体排班</h2><p className="mt-1 text-xs text-graphite-600">{weekStart} 至 {end} · 按真实报班安排本周，完成后自动保存到当前日历。</p></div><div className="flex flex-wrap items-center gap-3"><Link className="text-sm text-graphite-600 underline" to={`/agent-rules?week=${weekStart}`}>排班规则</Link><button className="agent-primary" disabled={blocked} onClick={()=>void start()}>{busy==='inputs'?'读取报班…':busy==='start'?'启动排班…':running?'正在排班…':'开始智能体排班'}</button></div></div>
    {recent&&recent.start_date!==weekStart&&<button className="mt-3 text-sm text-graphite-600 underline" onClick={()=>onShowWeek?.(recent.start_date)}>查看该任务的班表（{recent.start_date}）</button>}
    {state&&<div className="mt-3">{progressFrom!==weekStart&&<p className="mb-2 text-xs text-graphite-600">最近任务：{progressFrom} 至 {progressTo}</p>}<AgentRunProgress run={state} from={progressFrom} to={progressTo} runId={runId}/>
      {writes?.status==='FAILED'&&writes.message&&<p role="alert" className="mt-2 text-sm text-red-800">{writes.message}</p>}
      {writes?.status==='FAILED'&&(state.status==='DRAFT_VALIDATED'||Boolean(state.calendar_preview?.shifts.length))&&<button className="agent-secondary mt-3" disabled={Boolean(busy)} onClick={()=>void retryApply()}>重试保存</button>}
    </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
  </div></section>;
}
