import {describe,expect,it} from 'vitest';
import {calendarWithAgentPreview} from './agentCalendarPreview';
import {groupShiftsForCalendar} from './calendarGrouping';
import type {AgentCalendarPreview} from '../services/multiAgentRepository';
import type {Shift} from '../types/roster';

const shift=(id:string,date='2026-10-26'):Shift=>({id,date,rosterPeriodId:'period',storeId:'store',startAt:date+'T10:00:00+11:00',endAt:date+'T22:00:00+11:00',breakMinutes:0,version:1,shiftRoleId:'role',roleNameSnapshot:'Full',roleColorSnapshot:'#77516d',publicNote:null,internalNote:null,
  shiftRole:{id:'role',storeId:'store',code:'full',nameZh:'Full',colorToken:'#77516d',requiredSkillCodes:[],isActive:true,version:1},assignments:[]});
const candidate={...shift('candidate'),agentPreview:true};
const preview:AgentCalendarPreview={run_id:'run',from:'2026-10-26',to:'2026-11-01',preserve_existing:false,preserved_shift_ids:['fixed'],version:1,accepted_dates:['2026-10-26'],shifts:[candidate],saved:false};

describe('display-only calendar candidates',()=>{
  it('replaces the target week only on screen, preserving fixed/outside shifts and the original array',()=>{
    const saved=[shift('ordinary'),shift('fixed'),shift('outside','2026-11-02')];
    expect(calendarWithAgentPreview(saved,preview,true).map(s=>s.id)).toEqual(['fixed','outside','candidate']);
    expect(saved.map(s=>s.id)).toEqual(['ordinary','fixed','outside']);
    expect(calendarWithAgentPreview(saved,preview,false)).toBe(saved);
    expect(calendarWithAgentPreview(saved,{...preview,preserve_existing:true},true)).toHaveLength(4);
  });
  it('never merges a candidate into the same ordinary calendar group',()=>{
    const groups=groupShiftsForCalendar([shift('saved'),candidate]);
    expect(groups).toHaveLength(2);
    expect(groups.every(g=>g.shiftIds.length===1)).toBe(true);
  });
});
