import {describe,expect,it} from 'vitest';
import {agentProgress} from './agentProgress';
import type {AgentRun,AgentShift} from '../services/multiAgentRepository';

describe('authoritative agent progress',()=>{
  it('keeps incomplete-day shifts and merges adjacent missing slots into explicit deficits',()=>{
    const date='2026-10-28';
    const shifts=[{id:'full',date,start:date+'T10:00:00+11:00',end:date+'T22:00:00+11:00'} as AgentShift];
    const coverage=[11,11.5,12].map(hour=>({date,start:`${date}T${Math.floor(hour)}:${hour%1?'30':'00'}:00+11:00`,end:`${date}T${Math.floor(hour+.5)}:${(hour+.5)%1?'30':'00'}:00+11:00`,required:4,scheduled:3,difference:-1,employee_ids:['a','b','c']}));
    const run={status:'FAILED',events:[{kind:'PARTIAL_COMMITTED',date,time:date,assignments:shifts}],history:[],
      result:{run_id:'run',status:'FAILED',context:null,ledger:{version:1,employees:[]},business_rule_report:null,calendar:{},publishable:false,assignments:shifts,incomplete_dates:[date],failed_days:[{date,reason:'BEST_EFFORT_INCOMPLETE',coverage}],validation:{valid:false,coverage,errors:[]}},calendar_write:{status:'APPLIED',receipt:{created:1,deleted:0}}} satisfies AgentRun;
    const info=agentProgress(run,date,date);
    expect(info).toMatchObject({passed:0,failed:1,processed:1,accepted:1,saved:true});
    expect(info.days[0]).toMatchObject({tone:'partial',shifts:1,minutes:720});
    expect(info.days[0].gaps).toHaveLength(1);
    expect(info.days[0].reason).toContain('11:00–12:30 缺 1 人（需要 4，已排 3）');
    expect(info.stages.find(s=>s.id==='write')?.tone).toBe('passed');
  });
  it('keeps processed dates separate from passed dates and actual calendar writes',()=>{
    const dates=['2026-10-26','2026-10-27','2026-10-30','2026-11-01'];
    const shifts=dates.flatMap(date=>Array.from({length:2},(_,i)=>({date,id:date+i,start:date+'T10:00:00+11:00',end:date+'T22:00:00+11:00'} as AgentShift)));
    const failed=['2026-10-28','2026-10-29','2026-10-31'];
    const run={status:'FAILED',events:[...dates.map(date=>({kind:'COMMITTED',date,time:date,assignments:shifts})),...failed.map(date=>({kind:'DAY_FAILED',date,time:date}))],history:[],
      result:{run_id:'run',status:'FAILED',context:null,ledger:{version:4,employees:[]},business_rule_report:null,calendar:null,publishable:false,assignments:shifts,failed_days:failed.map(date=>({date,reason:'DAILY_REPAIR_EXHAUSTED'})),validation:{valid:false,coverage:[],errors:[]}},calendar_write:{status:'FAILED'}} satisfies AgentRun;
    const info=agentProgress(run,'2026-10-26','2026-11-01');
    expect(info).toMatchObject({passed:4,failed:3,processed:7,total:7,accepted:8,saved:false});
    expect(info.days[0]).toMatchObject({shifts:2,minutes:1440});
    expect(info.stages.find(s=>s.id==='daily')?.tone).toBe('failed');
    expect(info.stages.find(s=>s.id==='audit')?.tone).toBe('failed');
    expect(info.stages.find(s=>s.id==='write')?.tone).toBe('blocked');
  });
  it('shows the currently running date without pretending previous days saved to the database',()=>{
    const run={status:'RUNNING',result:null,history:[],events:[{kind:'AGENT_COMPLETED',agent:'requirement',time:'2026-10-26'},{kind:'COMMITTED',date:'2026-10-26',time:'2026-10-26',assignments:[]},{kind:'AGENT_RUNNING',agent:'daily',date:'2026-10-27',time:'2026-10-27'}],calendar_write:{status:'PENDING'}} as AgentRun;
    const info=agentProgress(run,'2026-10-26','2026-11-01');
    expect(info.days.map(d=>d.tone)).toEqual(['passed','running','waiting','waiting','waiting','waiting','waiting']);
    expect(info.saved).toBe(false);
    expect(info.stages.find(s=>s.id==='write')?.tone).toBe('waiting');
    const saved=agentProgress({...run,status:'DRAFT_VALIDATED',calendar_write:{status:'APPLIED',receipt:{created:5,deleted:0}}},'2026-10-26','2026-11-01');
    expect(saved.saved).toBe(true);
  });
});
