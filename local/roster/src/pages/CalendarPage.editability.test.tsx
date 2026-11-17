import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPage } from "./CalendarPage";
import type { CalendarShiftGroup } from "../lib/calendarGrouping";
import type { Shift } from "../types/roster";

const mocks=vi.hoisted(()=>({snapshot:vi.fn(),stores:vi.fn(),employees:vi.fn(),availability:vi.fn(),templates:vi.fn(),
  initialize:vi.fn(),toast:vi.fn(),remove:vi.fn(),update:vi.fn()}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{accountId:'fixture-account',role:'STORE_EVALUATOR',stores:[],storeIds:['store-a']}})}));
vi.mock('../store/StoreContext',()=>({useStoreSelection:()=>({selectedStoreId:'store-a',setSelectedStoreId:vi.fn(),initializeStoreId:mocks.initialize})}));
vi.mock('../components/ui/ToastProvider',()=>({useToast:()=>({showToast:mocks.toast}),InlineSpinner:()=>null}));
vi.mock('../services/workforceRepository',()=>({workforceRepository:{stores:mocks.stores,employees:mocks.employees}}));
vi.mock('../services/rosterRepository',()=>({rosterRepository:{availability:mocks.availability,templates:mocks.templates,deleteShift:mocks.remove,updateShift:mocks.update}}));
vi.mock('../lib/calendarLoad',async(importOriginal)=>({...await importOriginal<typeof import('../lib/calendarLoad')>(),loadCalendarSnapshot:mocks.snapshot}));
vi.mock('../components/calendar/CalendarAgentPanel',()=>({CalendarAgentPanel:({visible}:{visible:boolean})=>visible?<section aria-label="智能体进度区域"/>:null}));
type CalendarProps={events:Array<{id:string;extendedProps:{shiftGroup:CalendarShiftGroup}}>;
  datesSet:(value:unknown)=>void;eventClick:(value:unknown)=>void};
vi.mock('@fullcalendar/react',()=>({default:({events,datesSet,eventClick}:CalendarProps)=><div>
  <button onClick={()=>datesSet({start:new Date('2026-10-25T13:00:00Z'),end:new Date('2026-10-26T13:00:00Z'),
    view:{title:'2026-10-26',type:'timeGridDay',calendar:{getDate:()=>new Date('2026-10-26T00:00:00Z')}}})}>载入日历</button>
  {events.map((event)=><button key={event.id} onClick={()=>eventClick({event,jsEvent:new MouseEvent('click')})}>点击已有班次</button>)}
</div>}));
vi.mock('../components/calendar/ShiftDialog',()=>({ShiftDialog:({existingShift,onDelete,onSave,onClose}:{existingShift:Shift;onDelete:()=>Promise<void>;onSave:(v:unknown)=>Promise<void>;onClose:()=>void})=><div role="dialog" aria-label="编辑已有班次">
  <span>{existingShift.id}</span><button onClick={()=>void onSave({date:existingShift.date,startAt:existingShift.startAt,endAt:existingShift.endAt,breakMinutes:0,shiftRoleId:'role-a',employeeIds:['employee-a'],publicNote:'Edited',internalNote:''})}>保存编辑</button>
  <button onClick={()=>void onDelete()}>删除已有班次</button><button onClick={onClose}>关闭编辑</button>
</div>}));

let current:Shift;
beforeEach(()=>{
  vi.clearAllMocks();
  const role={id:'role-a',storeId:'store-a',code:'front',nameZh:'前场',colorToken:'#336699',requiredSkillCodes:[],isActive:true,version:1};
  current={id:'shift-a',rosterPeriodId:'period-a',storeId:'store-a',date:'2026-10-26',startAt:'2026-10-25T23:00:00Z',endAt:'2026-10-26T06:00:00Z',breakMinutes:0,
    shiftRoleId:role.id,shiftRole:role,roleNameSnapshot:'前场',roleColorSnapshot:'#336699',version:1,publicNote:null,internalNote:null,
    assignments:[{id:'assignment-a',employeeId:'employee-a',employeeNameSnapshot:'Actual employee',employeeTypeSnapshot:'REGULAR',officialScoreSnapshot:null,tierSnapshot:null}]} as Shift;
  const period={id:'period-a',storeId:'store-a',startDate:'2026-10-26',endDate:'2026-11-01',cycleType:'WEEK',status:'PUBLISHED',version:3,publishedAt:'2026-10-25T00:00:00Z'};
  const employees=[{id:'employee-a',storeId:'store-a',displayName:'Actual employee',isActive:true,employeeType:'REGULAR',employmentType:null,officialScore:null,
    positions:[{id:'job-a',name:'前场',code:'front'}],skillSummary:{qualifiedSkillCodes:[],operations:{}}}];
  mocks.stores.mockResolvedValue({stores:[{id:'store-a',name:'Fixture Store'}]});
  mocks.employees.mockResolvedValue({employees,generatedAt:'2026-10-26T00:00:00Z'});
  mocks.availability.mockResolvedValue([]);mocks.templates.mockResolvedValue([]);
  mocks.snapshot.mockImplementation(async(_store,range)=>({calendar:{storeId:'store-a',...range,periods:[period],shifts:[current]},roles:[role],jobs:[{id:'job-a',storeId:'store-a',name:'前场',code:'front',colorToken:'#336699',isActive:true}],
    workforce:{employees,generatedAt:'2026-10-26T00:00:00Z'},settings:{storeId:'store-a',timezone:'Australia/Sydney',openingTime:'10:00',closingTime:'22:00',slotIntervalMinutes:30,minimumShiftMinutes:60,cycleType:'WEEK',weekStartsOn:1},
    editContextError:null,periodContextError:null,periodShifts:[current],summary:{period,shiftCount:1,assignmentCount:1,totalHours:7,employeeHours:[],roleHours:[]}}));
  mocks.update.mockResolvedValue({...current,version:2});mocks.remove.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('current calendar editability',()=>{
  it('opens progress by default when entering the sidebar calendar route without agent parameters',async()=>{
    render(<MemoryRouter initialEntries={['/calendar']}><CalendarPage/></MemoryRouter>);
    await screen.findByLabelText('智能体进度区域');
    expect(screen.getByRole('button',{name:'智能体排班'}).getAttribute('aria-expanded')).toBe('true');
  });
  async function open(){
    render(<MemoryRouter initialEntries={['/calendar?store=store-a&date=2026-10-26']}><CalendarPage/></MemoryRouter>);
    fireEvent.click(await screen.findByText('载入日历'));
    fireEvent.click(await screen.findByText('点击已有班次'));
    await screen.findByRole('dialog',{name:'编辑已有班次'});
    await waitFor(()=>expect(mocks.availability).toHaveBeenCalled());
  }
  it.each(['save','delete'])('uses the same ordinary editor and version checks for saved agent shifts: %s',async(action)=>{
    current={...current,id:'saved-agent-shift',version:4,internalNote:'智能体排班 · Full · 休息尚未安排'};
    await open();
    expect(screen.queryByText('班次详情')).toBeNull();
    if(action==='save'){
      fireEvent.click(screen.getByText('保存编辑'));
      await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('saved-agent-shift',expect.objectContaining({version:4,publicNote:'Edited'})));
    }else{
      fireEvent.click(screen.getByText('删除已有班次'));
      await waitFor(()=>expect(mocks.remove).toHaveBeenCalledWith('saved-agent-shift','store-a',4));
    }
  });
  it('opens an editable form for a legacy PUBLISHED shift and saves with its version',async()=>{
    await open();
    expect(screen.queryByText('发布本周期')).toBeNull();
    expect(screen.queryByText('重新打开草稿')).toBeNull();
    fireEvent.click(screen.getByText('保存编辑'));
    await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('shift-a',expect.objectContaining({storeId:'store-a',version:1,publicNote:'Edited'})));
  });
  it('deletes the clicked shift directly without reopening its period',async()=>{
    await open();fireEvent.click(screen.getByText('删除已有班次'));
    await waitFor(()=>expect(mocks.remove).toHaveBeenCalledWith('shift-a','store-a',1));
  });
});
