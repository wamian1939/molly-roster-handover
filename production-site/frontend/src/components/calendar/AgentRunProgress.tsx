import {useEffect,useState} from 'react';
import {DateTime} from 'luxon';
import {agentProgress,eventDescription,type ProgressTone} from '../../lib/agentProgress';
import type {AgentRun} from '../../services/multiAgentRepository';

const labels:Record<ProgressTone,string>={passed:'满足',partial:'未完全满足',failed:'未满足',running:'进行中',waiting:'待处理',blocked:'未写入'};
export function AgentRunProgress({run,from,to,runId}:{run:AgentRun;from:string;to:string;runId:string}){
  const info=agentProgress(run,from,to);const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(info.terminal)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[info.terminal]);
  const seconds=info.start?Math.max(0,Math.floor(((info.end?Date.parse(info.end):now)-Date.parse(info.start))/1000)):0;
  const elapsed=`${Math.floor(seconds/60)}分${seconds%60}秒`;
  const failed=run.status==='FAILED'||run.status==='INTERRUPTED';
  const writingFailed=run.calendar_write?.status==='FAILED';
  const title=info.saved?failed?'已保存可编辑班次，部分日期未排满':'排班已保存到日历':failed&&run.calendar_write?.status==='PENDING'?'正在保存已排好的班次':failed?'排班未通过，尚未写入日历':writingFailed?'日历保存未成功':run.status==='DRAFT_VALIDATED'?'验证完成，正在写入日历':'智能体正在运行';
  return <div className="agent-run-progress" aria-label="智能体任务进度">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm" role="status"><strong className={failed||writingFailed?'text-red-800':info.saved?'text-emerald-800':''}>{title}</strong><span className="text-xs text-graphite-600">已处理 {info.processed}/{info.total} 天 · {elapsed}</span></div>
    <progress className="agent-day-progress" max={info.total} value={info.processed} aria-label="日期处理进度"/>
    <p className="mt-2 text-xs text-graphite-600">{info.saved?`已保存 ${run.calendar_write?.receipt?.created??0} 个班次，可直接编辑或删除。${failed?`${info.failed} 天未排满，可继续人工排班。`:''}`:failed?`${info.passed} 天通过，${info.failed} 天未通过。${run.calendar_write?.status==='PENDING'?'已通过日期正在保存到日历。':'未保存的班次不会显示为可编辑班表。'}`:writingFailed?run.calendar_write?.message:info.latest}</p>
    {info.days.some(d=>d.tone==='partial')&&<ul className="mt-3 space-y-2 text-xs text-amber-900" aria-label="未完全满足的日期">{info.days.filter(d=>d.tone==='partial').map(day=><li key={day.date}><strong>{DateTime.fromISO(day.date).setLocale('zh-CN').toFormat('ccc MM-dd')} · 未完全满足</strong><p className="mt-1 leading-relaxed">{day.reason}</p></li>)}</ul>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer text-graphite-600">运行详情</summary>
    <ol className="agent-pipeline">{info.stages.map((s,index)=><li key={s.id} data-state={s.tone}><span className="agent-stage-marker" aria-hidden="true">{s.tone==='passed'?'✓':s.tone==='failed'||s.tone==='blocked'?'!':index+1}</span><div><strong>{s.label}</strong><span>{s.detail}</span></div></li>)}</ol>
    <div className="agent-table-scroll"><table className="agent-table agent-day-table"><thead><tr><th>日期</th><th>状态</th><th>已排班次</th><th>名义工时</th><th>处理情况</th></tr></thead><tbody>{info.days.map(day=><tr key={day.date} data-state={day.tone}><td>{DateTime.fromISO(day.date).setLocale('zh-CN').toFormat('ccc MM-dd')}</td><td><span className={`agent-state-label is-${day.tone}`}>{labels[day.tone]}</span></td><td>{day.shifts}</td><td>{(day.minutes/60).toFixed(1)} h</td><td>{day.reason}</td></tr>)}</tbody></table></div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">最近执行记录与任务编号</summary><p className="mt-2 break-all text-xs text-graphite-600">任务 {runId} · 最近更新 {info.updated?DateTime.fromISO(info.updated).setZone(run.timezone??'Australia/Sydney').toFormat('HH:mm:ss'):'等待服务端事件'}</p><ol className="agent-run-log">{run.events.filter(e=>['AGENT_RUNNING','COMMITTED','DAY_FAILED','REPAIR_ROUTED','RUN_FINISHED','CONTEXT_ACCEPTED'].includes(e.kind)).slice(-12).map((event,index)=><li key={index}><time>{DateTime.fromISO(event.time).setZone(run.timezone??'Australia/Sydney').toFormat('HH:mm:ss')}</time><span>{eventDescription(event.kind,event.agent,event.date)}{event.attempt!==undefined?` · 第${event.attempt+1}轮`:''}</span></li>)}</ol></details>
    </details>
  </div>;
}
