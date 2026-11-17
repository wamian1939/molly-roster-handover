import {addCalendarDays} from './storeTime';
import {DateTime} from 'luxon';
import type {AgentRun,AgentSlot} from '../services/multiAgentRepository';

export type ProgressTone='waiting'|'running'|'passed'|'partial'|'failed'|'blocked';

export function coverageGaps(slots:AgentSlot[],zone:string){
  const groups:Array<{start:string;end:string;required:number;scheduled:number;missing:number}>=[];
  for(const slot of [...slots].filter(s=>s.difference<0).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))){
    const last=groups.at(-1);
    if(last&&Date.parse(last.end)===Date.parse(slot.start)&&last.required===slot.required&&last.scheduled===slot.scheduled)last.end=slot.end;
    else groups.push({start:slot.start,end:slot.end,required:slot.required,scheduled:slot.scheduled,missing:-slot.difference});
  }
  return groups.map(g=>({...g,label:`${DateTime.fromISO(g.start).setZone(zone).toFormat('HH:mm')}–${DateTime.fromISO(g.end).setZone(zone).toFormat('HH:mm')} 缺 ${g.missing} 人（需要 ${g.required}，已排 ${g.scheduled}）`}));
}
export function agentProgress(run:AgentRun,from:string,to:string){
  const events=run.events;
  const terminal=run.status!=='RUNNING';
  const finished=events.filter(e=>e.kind==='RUN_FINISHED').at(-1);
  const lastRunning=events.filter(e=>e.kind==='AGENT_RUNNING').at(-1);
  const latest=events.at(-1);
  const rows=[];
  for(let day=from;day<=to;day=addCalendarDays(day,1)){
    const own=events.filter(e=>e.date===day);
    const commit=own.filter(e=>['COMMITTED','PARTIAL_COMMITTED'].includes(e.kind)).at(-1);
    const failure=own.filter(e=>e.kind==='DAY_FAILED').at(-1);
    const diagnostic=run.result?.failed_days.find(d=>d.date===day);
    const choices=own.filter(e=>e.kind==='DAILY_CHOICE');
    const retry=own.filter(e=>e.kind==='REPAIR_ROUTED'&&e.agent==='daily');
    const incomplete=commit?.kind==='PARTIAL_COMMITTED'||run.result?.incomplete_dates?.includes(day);
    const tone:ProgressTone=incomplete?'partial':commit?'passed':failure||diagnostic?'failed':!terminal&&lastRunning?.agent==='daily'&&lastRunning.date===day?'running':'waiting';
    const shifts=(run.result?.assignments??commit?.assignments??[]).filter(s=>s.date===day);
    const gaps=coverageGaps((run.result?.validation.coverage??diagnostic?.coverage??own.find(e=>e.kind==='DAY_INCOMPLETE')?.coverage??[]).filter(s=>s.date===day),run.timezone??'Australia/Sydney');
    const conflict=diagnostic?.errors?.[0];
    const shortage=conflict?.code==='ELIGIBILITY_SHORTAGE'&&conflict.start&&conflict.end
      ?`${DateTime.fromISO(conflict.start).setZone(run.timezone??'Australia/Sydney').toFormat('HH:mm')}–${DateTime.fromISO(conflict.end).setZone(run.timezone??'Australia/Sydney').toFormat('HH:mm')} 需要 ${conflict.required} 人，合法可用 ${conflict.eligible_employee_ids?.length??0} 人`
      :conflict?.message??'当前报班、岗位或人数规则存在容量缺口';
    const reason=tone==='passed'?`${shifts.length} 个班次通过当日验证`
      :tone==='partial'?`已排 ${shifts.length} 个班次；${gaps.length?gaps.map(g=>g.label).join('；'):diagnostic?.errors?.[0]?.message??'指定员工或开早要求未完全满足'}`
      :diagnostic?.reason==='PROVEN_SOURCE_SHORTAGE'?shortage
      :diagnostic?.reason==='DAILY_REPAIR_EXHAUSTED'?`同日候选尝试 ${retry.length||1} 轮，未得到完整合法组合`
      :tone==='failed'?failure?.errors?.[0]?.message??diagnostic?.errors?.[0]?.message??'当日验证未通过'
      :tone==='running'?choices.length?`已选择 ${choices.length} 次候选，正在核对时段覆盖`:'正在选择员工与班型'
      :'尚未开始';
    rows.push({date:day,tone,reason,gaps,shifts:shifts.length,attempts:retry.length,minutes:shifts.reduce((sum,s)=>sum+(Date.parse(s.end)-Date.parse(s.start))/60000,0)});
  }
  const passed=rows.filter(d=>d.tone==='passed').length,failed=rows.filter(d=>d.tone==='failed'||d.tone==='partial').length;
  const currentOrder=['requirement','daily','review','audit'].indexOf(lastRunning?.agent??'requirement');
  const names:Record<string,string>={requirement:'需求理解',daily:'逐日排班',review:'遗漏员工审查',audit:'全周验证'};
  const stages:Array<{id:string;tone:ProgressTone;label:string;detail:string}>=['requirement','daily','review','audit'].map((id,index)=>{
    const completed=events.some(e=>e.agent===id&&e.kind==='AGENT_COMPLETED');
    let tone:ProgressTone=completed?'passed':!terminal&&index===currentOrder?'running':index<currentOrder?'passed':'waiting';
    if(id==='daily')tone=failed&&(terminal||passed+failed===rows.length)?'failed':passed+failed===rows.length?'passed':!terminal&&currentOrder===1?'running':tone;
    if(id==='requirement'&&terminal&&!completed)tone='failed';
    if(id==='audit'&&terminal&&run.result?.validation.valid===false)tone='failed';
    return {id,tone,label:names[id],detail:id==='daily'?`${passed} 天满足 · ${failed} 天未完全满足`:tone==='passed'?'已完成':tone==='running'?'正在处理':tone==='failed'?'未通过':'等待'};
  });
  const saved=run.calendar_write?.status==='APPLIED';
  const writing=run.status!=='RUNNING'&&run.calendar_write?.status==='PENDING';
  stages.push({id:'write',tone:saved?'passed':writing?'running':terminal?'blocked':'waiting',label:'写入日历',detail:saved?'已保存':writing?'事务写入中':terminal?'尚未写入':'等待全周验证'});
  const accepted=run.result?.assignments.length??run.calendar_preview?.shifts.length??0;
  return {days:rows,stages,passed,failed,processed:passed+failed,total:rows.length,accepted,saved,
    calls:events.filter(e=>e.kind==='AGENT_RUNNING').length,start:events[0]?.time,end:finished?.time,
    latest:latest?eventDescription(latest.kind,latest.agent,latest.date):'正在建立任务',
    updated:latest?.time,terminal};
}

export function eventDescription(kind:string,agent?:string,date?:string){
  const names:Record<string,string>={requirement:'需求理解',daily:'逐日排班',review:'遗漏员工审查',audit:'全周验证'};
  const actions:Record<string,string>={RUN_STARTED:'任务启动',AGENT_RUNNING:'开始处理',AGENT_OUTPUT:'收到结构化结果',AGENT_COMPLETED:'完成',COMMITTED:'当日验证通过，更新工时',PARTIAL_COMMITTED:'保留当日可排班次，更新工时',DAY_INCOMPLETE:'当天未完全满足，已记录缺口',DAY_FAILED:'当日未通过',REPAIR_ROUTED:'返回同日修复',RUN_FINISHED:'任务结束',DAILY_CHOICE:'选择候选班次',CONTEXT_ACCEPTED:'需求一致性检查通过'};
  return `${date?date+' · ':''}${agent?names[agent]??agent:''}${agent?' · ':''}${actions[kind]??kind}`;
}
