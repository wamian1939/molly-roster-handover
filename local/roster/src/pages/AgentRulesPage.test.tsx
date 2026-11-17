import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AgentRulesPage} from './AgentRulesPage';
const m=vi.hoisted(()=>({rules:vi.fn(),save:vi.fn(),stores:vi.fn(),initialize:vi.fn()}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{accountId:'account'}})}));
vi.mock('../store/StoreContext',()=>({useStoreSelection:()=>({selectedStoreId:'hurstville',setSelectedStoreId:vi.fn(),initializeStoreId:m.initialize})}));
vi.mock('../services/workforceRepository',()=>({workforceRepository:{stores:m.stores}}));
vi.mock('../services/multiAgentRepository',()=>({multiAgentRepository:{rules:m.rules,saveRules:m.save}}));
vi.mock('../components/ui/AppSelect',()=>({AppSelect:({label,value,onValueChange,options}:{label:string;value:string;onValueChange:(value:string)=>void;options:Array<{value:string;label:string}>})=><label>{label}<select value={value} onChange={e=>onValueChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}));
const weekly=Object.fromEntries(Array.from({length:7},(_,d)=>[String(d),[{start:'10:00',end:'11:00',staff:3},{start:'11:00',end:'17:00',staff:4},{start:'17:00',end:'22:00',staff:4}]]));
beforeEach(()=>{vi.clearAllMocks();m.stores.mockResolvedValue({stores:[{id:'hurstville',name:'Hurstville'}]});m.rules.mockResolvedValue({store_id:'hurstville',week_start:'2026-10-26',base_rule_version:'hurstville:v20',effective_rule_version:'hurstville:v20',default_version:0,week_version:0,effective_scope:'DEFAULT',weekly,default_weekly:weekly,week_weekly:null,timezone:'Australia/Sydney',business_rules:null});m.save.mockResolvedValue({saved:true,version:1,scope:'DEFAULT',store_id:'hurstville'});});
afterEach(cleanup);
describe('agent rule settings',()=>{
  it('saves edited exact counts as an independent recurring version',async()=>{
    render(<MemoryRouter initialEntries={['/agent-rules?week=2026-10-26']}><AgentRulesPage/></MemoryRouter>);
    const count=await screen.findByLabelText('周一时段2人数');fireEvent.change(count,{target:{value:'5'}});
    fireEvent.click(screen.getByText('保存排班规则'));
    await waitFor(()=>expect(m.save).toHaveBeenCalledWith(expect.objectContaining({scope:'DEFAULT',weekStart:null,expectedVersion:0,weekly:expect.objectContaining({'0':expect.arrayContaining([expect.objectContaining({start:'11:00',staff:5})])})})));
    await screen.findByText('固定规则已保存，版本 1');
    expect(screen.getByRole('link',{name:'到日历生成班表'}).getAttribute('href')).toContain('/calendar?');
  });
  it('can scope an adjustment to the selected week without replacing the recurring template',async()=>{
    m.save.mockResolvedValue({saved:true,version:1,scope:'WEEK',store_id:'hurstville'});
    render(<MemoryRouter initialEntries={['/agent-rules?week=2026-10-26']}><AgentRulesPage/></MemoryRouter>);
    await screen.findByLabelText('周一时段2人数');fireEvent.change(screen.getByLabelText('规则生效范围'),{target:{value:'WEEK'}});
    fireEvent.click(screen.getByText('保存排班规则'));
    await waitFor(()=>expect(m.save).toHaveBeenCalledWith(expect.objectContaining({scope:'WEEK',weekStart:'2026-10-26'})));
  });
});
