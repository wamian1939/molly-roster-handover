import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CalendarAgentPanel} from './CalendarAgentPanel';
const m=vi.hoisted(()=>({inputs:vi.fn(),start:vi.fn(),status:vi.fn(),applied:vi.fn(),recent:vi.fn()}));
vi.mock('../../auth/AuthContext',()=>({useAuth:()=>({user:{accountId:'account'}})}));
vi.mock('../../services/multiAgentRepository',()=>({multiAgentRepository:{inputs:m.inputs,start:m.start,status:m.status,recentRun:m.recent}}));
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();m.recent.mockResolvedValue({run:null});m.inputs.mockResolvedValue({rules:{version:'agent:v1',timezone:'Australia/Sydney'},employees:[],availability_count:10,detached_existing_count:3,source_diagnostics:[]});m.start.mockResolvedValue({run_id:'run-id',status:'RUNNING'});m.status.mockResolvedValue({status:'DRAFT_VALIDATED',events:[],history:[],result:null,calendar_write:{status:'APPLIED',receipt:{created:4,deleted:3}}});m.applied.mockResolvedValue(undefined);});
afterEach(cleanup);
describe('calendar agent generation',()=>{
  it('automatically shows the previous-week task from the ordinary calendar entry without requiring navigation',async()=>{
    m.recent.mockResolvedValue({run:{run_id:'last-week',start_date:'2026-10-26',end_date:'2026-11-01'}});
    m.status.mockResolvedValue({status:'RUNNING',events:[{kind:'COMMITTED',date:'2026-10-26',time:'2026-11-03T00:00:00Z',assignments:[]}],history:[],result:null,calendar_write:{status:'PENDING'}});
    render(<MemoryRouter initialEntries={['/calendar']}><CalendarAgentPanel storeId="hurstville" weekStart="2026-11-02" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await screen.findByText('最近任务：2026-10-26 至 2026-11-01');
    expect(screen.getByText(/已处理 1\/7 天/)).toBeTruthy();
    expect(m.status).toHaveBeenCalledWith('hurstville','last-week');
    expect(sessionStorage.getItem('roster:calendar-agent:account:hurstville:2026-11-02')).toBeNull();
    expect(sessionStorage.getItem('roster:calendar-agent:account:hurstville:2026-10-26')).toBe('last-week');
    expect(m.start).not.toHaveBeenCalled();
  });
  it('refreshes an older cached task from the server rather than hiding the latest task',async()=>{
    sessionStorage.setItem('roster:calendar-agent:account:hurstville:2026-11-02','older-cache');
    m.recent.mockResolvedValue({run:{run_id:'latest-run',start_date:'2026-10-26',end_date:'2026-11-01'}});
    m.status.mockResolvedValue({status:'RUNNING',events:[],history:[],result:null,calendar_write:{status:'PENDING'}});
    render(<MemoryRouter initialEntries={['/calendar']}><CalendarAgentPanel storeId="hurstville" weekStart="2026-11-02" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await waitFor(()=>expect(m.status).toHaveBeenCalledWith('hurstville','latest-run'));
    await screen.findByText('最近任务：2026-10-26 至 2026-11-01');
    expect(m.start).not.toHaveBeenCalled();
  });
  it('recovers a failed task without presenting unsaved records as editable calendar shifts',async()=>{
    m.recent.mockResolvedValue({run:{run_id:'recent',start_date:'2026-10-26',end_date:'2026-11-01'}});
    const candidate={run_id:'recent',version:4,from:'2026-10-26',to:'2026-11-01',saved:false,accepted_dates:['2026-10-26'],shifts:[]};
    m.status.mockResolvedValue({status:'FAILED',events:[],history:[],result:null,calendar_preview:candidate,calendar_write:{status:'FAILED',message:'全周验证失败，原班表保留'}});
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await screen.findByText('排班未通过，尚未写入日历');
    expect(m.applied).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('roster:calendar-agent:account:hurstville:2026-10-26')).toBe('recent');
  });
  it('reads real inputs and starts automatic calendar saving with one click and no confirmation',async()=>{
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('读取规则和真实报班')).toBeNull();
    fireEvent.click(screen.getByText('开始智能体排班'));
    await waitFor(()=>expect(m.inputs).toHaveBeenCalledWith('hurstville','2026-10-26','2026-11-01',false));
    await waitFor(()=>expect(m.start).toHaveBeenCalledWith('hurstville','2026-10-26','2026-11-01',false,expect.any(Object),true));
    await waitFor(()=>expect(m.applied).toHaveBeenCalledOnce());await screen.findByText(/已保存 4 个班次/);
  });
  it('does not start a task if authoritative input loading fails',async()=>{
    m.inputs.mockRejectedValue(new Error('报班读取失败'));
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    fireEvent.click(screen.getByText('开始智能体排班'));
    await screen.findByRole('alert');expect(m.start).not.toHaveBeenCalled();
  });
  it('restores calendar results on the ordinary route even with the controls collapsed',async()=>{
    m.recent.mockResolvedValue({run:{run_id:'recent',start_date:'2026-10-26',end_date:'2026-11-01'}});
    render(<MemoryRouter initialEntries={['/calendar']}><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible={false} disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await waitFor(()=>expect(m.status).toHaveBeenCalledWith('hurstville','recent'));
    await waitFor(()=>expect(m.applied).toHaveBeenCalledOnce());
  });
  it('shows a failed write without falsely refreshing or claiming it was saved',async()=>{
    sessionStorage.setItem('roster:calendar-agent:account:hurstville:2026-10-26','failed-run');
    m.status.mockResolvedValue({status:'FAILED',events:[],history:[],result:null,calendar_write:{status:'FAILED',message:'全周验证失败，原班表保留'}});
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await screen.findByText('全周验证失败，原班表保留');expect(m.applied).not.toHaveBeenCalled();
  });
  it('refreshes ordinary editable records after accepted days are saved, retaining the failed-week message',async()=>{
    sessionStorage.setItem('roster:calendar-agent:account:hurstville:2026-10-26','partial-run');
    m.status.mockResolvedValue({status:'FAILED',events:[],history:[],result:{assignments:[],failed_days:[{date:'2026-10-28'}],validation:{valid:false}},calendar_write:{status:'APPLIED',receipt:{created:34,deleted:0}}});
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    await waitFor(()=>expect(m.applied).toHaveBeenCalledOnce());
    await screen.findByText('已保存可编辑班次，部分日期未排满');
    expect(screen.getByText(/已保存 34 个班次，可直接编辑或删除/)).toBeTruthy();
  });
  it('shows incomplete dates and actual shortfalls without expanding run details',async()=>{
    sessionStorage.setItem('roster:calendar-agent:account:hurstville:2026-10-26','best-effort');
    const date='2026-10-28';
    const coverage=[{date,start:date+'T11:00:00+11:00',end:date+'T11:30:00+11:00',required:4,scheduled:3,difference:-1,employee_ids:['a','b','c']}];
    m.status.mockResolvedValue({status:'FAILED',events:[],history:[],result:{assignments:[{date,start:date+'T10:00:00+11:00',end:date+'T22:00:00+11:00'}],incomplete_dates:[date],failed_days:[{date,reason:'BEST_EFFORT_INCOMPLETE',coverage}],validation:{valid:false,coverage,errors:[]}},calendar_write:{status:'APPLIED',receipt:{created:1,deleted:0}}});
    render(<MemoryRouter><CalendarAgentPanel storeId="hurstville" weekStart="2026-10-26" visible disabled={false} onApplied={m.applied}/></MemoryRouter>);
    const warning=await screen.findByRole('list',{name:'未完全满足的日期'});
    expect(warning.textContent).toContain('10-28 · 未完全满足');
    expect(warning.textContent).toContain('需要 4，已排 3');
    expect(warning.closest('details')).toBeNull();
    await waitFor(()=>expect(m.applied).toHaveBeenCalledOnce());
  });
});
