import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {prisma} from '../src/prisma.js';
import {RosterService,type AgentCalendarPlan,type AssignmentSnapshot} from '../src/rosterService.js';

const dbTests=process.env.RUN_DATABASE_TESTS==='1'?describe:describe.skip;
dbTests('agent writes into the ordinary editable calendar atomically',()=>{
  const service=new RosterService(prisma);const storeId='agent-write-'+randomUUID();const employeeId='employee-'+randomUUID();
  const from='2040-03-05',to='2040-03-11';let roleId='';let audit='';const originalAudit=process.env.MULTI_AGENT_AUDIT_DIR;
  const assignment:AssignmentSnapshot={employeeId,employeeNameSnapshot:'Isolated employee',employeeTypeSnapshot:'REGULAR',employmentTypeSnapshot:null,officialScoreSnapshot:88,tierSnapshot:'T2',officialScoreRoundId:'closed-round',officialScoreClosedAt:null};
  beforeAll(async()=>{
    audit=await mkdtemp(join(tmpdir(),'roster-agent-audit-'));process.env.MULTI_AGENT_AUDIT_DIR=audit;
    await service.saveSettings({storeId,timezone:'UTC',openingTime:'00:00',closingTime:'23:59',slotIntervalMinutes:30,minimumShiftMinutes:60,defaultBreakMinutes:0,weekStartsOn:1,cycleType:'WEEK',weeklyHourWarning:38,dailyHourWarning:10});
    roleId=(await prisma.shiftRole.create({data:{storeId,code:'qa-'+randomUUID(),nameZh:'QA',colorToken:'#334455'}})).id;
    await service.replaceAvailability({storeId,employeeId,dates:[from,'2040-03-06','2040-03-12'],entries:[from,'2040-03-06','2040-03-12'].map(date=>({date,status:'AVAILABLE',startAt:date+'T10:00:00Z',endAt:date+'T22:00:00Z'}))});
  });
  afterAll(async()=>{
    await prisma.shiftCreateRequest.deleteMany({where:{storeId}});await prisma.rosterPeriod.deleteMany({where:{storeId}});
    await prisma.employeeAvailability.deleteMany({where:{storeId}});await prisma.rosterStoreSettings.deleteMany({where:{storeId}});await prisma.shiftRole.deleteMany({where:{storeId}});
    if(audit){for(const file of await readdir(audit)){if(!/^[0-9a-f-]+\.json$/.test(file))throw Error('Unexpected audit file');await unlink(join(audit,file));}await rmdir(audit);}
    if(originalAudit===undefined)delete process.env.MULTI_AGENT_AUDIT_DIR;else process.env.MULTI_AGENT_AUDIT_DIR=originalAudit;
    await prisma.$disconnect();
  });
  async function plan(start=from,end=to):Promise<AgentCalendarPlan>{return {storeId,runId:randomUUID(),from:start,to:end,preserveExisting:false,expectedToken:await service.agentCalendarToken(storeId,start,end),
    shifts:[{key:'full-'+start,sourceShiftId:null,fixed:false,value:{date:start,startAt:start+'T10:00:00Z',endAt:start+'T22:00:00Z',shiftRoleId:roleId,breakMinutes:0,internalNote:'Agent Full; breaks pending',assignments:[assignment]}}]};}
  it('backs up and replaces the selected week, then leaves the generated shift editable and retries idempotently',async()=>{
    const original=await service.createShiftWithPeriod({storeId,date:from,targetStartDate:from,targetEndDate:to,startAt:from+'T12:00:00Z',endAt:from+'T15:00:00Z',breakMinutes:0,shiftRoleId:roleId,assignments:[assignment],internalNote:'Existing calendar note'},'account');
    const value=await plan();const applied=await service.applyAgentCalendar(value,'account');
    expect(applied).toMatchObject({created:1,deleted:1,alreadyApplied:false});
    expect(await prisma.shift.findUnique({where:{id:original.id}})).toBeNull();
    const calendar=await service.calendar(storeId,from,to);expect(calendar.shifts).toHaveLength(1);
    const saved=calendar.shifts[0];expect(saved.id).toBe(applied.shiftIds[0]);expect(saved.internalNote).toContain('pending');
    const backup=JSON.parse(await readFile(join(audit,value.runId+'.json'),'utf8'));expect(backup.before.shifts[0].internalNote).toBe('Existing calendar note');
    await service.updateShift(saved.id,{...value.shifts[0].value,storeId,rosterPeriodId:saved.rosterPeriodId,version:saved.version,endAt:from+'T21:00:00Z'},'account');
    expect(await service.applyAgentCalendar(value,'account')).toMatchObject({alreadyApplied:true});
    expect((await service.getShift(storeId,saved.id)).endAt).toBe(from+'T21:00:00.000Z');
    expect(await service.agentApplicationReceipt(storeId,value.runId,'other-account')).toBeNull();
  });
  it('does not overwrite a manual edit made after generation started',async()=>{
    const value=await plan();const current=(await service.calendar(storeId,from,to)).shifts[0];
    await service.updateShift(current.id,{...value.shifts[0].value,storeId,rosterPeriodId:current.rosterPeriodId,version:current.version,endAt:from+'T20:00:00Z'},'account');
    await expect(service.applyAgentCalendar(value,'account')).rejects.toMatchObject({status:409,validation:{code:'STALE_VERSION'}});
    expect((await service.calendar(storeId,from,to)).shifts[0].endAt).toBe(from+'T20:00:00.000Z');
  });
  it('rolls back the entire replacement if current availability rejects a generated shift',async()=>{
    const value=await plan();value.shifts[0].value.endAt=from+'T23:00:00Z';
    const before=await service.calendar(storeId,from,to);
    await expect(service.applyAgentCalendar(value,'account')).rejects.toMatchObject({status:422});
    expect(await service.calendar(storeId,from,to)).toEqual(before);
    expect(await service.agentApplicationReceipt(storeId,value.runId,'account')).toBeNull();
  });
  it('creates the configured calendar period and its first shift in the same transaction',async()=>{
    const value=await plan('2040-03-12','2040-03-18');await service.applyAgentCalendar(value,'account');
    const calendar=await service.calendar(storeId,value.from,value.to);expect(calendar.periods).toHaveLength(1);expect(calendar.shifts).toHaveLength(1);
  });
  it('saves only accepted dates, keeps failed dates intact, and supports ordinary edit and delete',async()=>{
    const failedDate='2040-03-06';
    const untouched=await service.createShiftWithPeriod({storeId,date:failedDate,targetStartDate:from,targetEndDate:to,startAt:failedDate+'T12:00:00Z',endAt:failedDate+'T18:00:00Z',breakMinutes:0,shiftRoleId:roleId,assignments:[assignment],internalNote:'Manual work on failed day'},'account');
    const value=await plan();value.applyDates=[from];value.shifts[0].value.internalNote='智能体排班 · Full · 休息尚未安排';
    const result=await service.applyAgentCalendar(value,'account');
    expect(result.created).toBe(1);
    expect(await service.getShift(storeId,untouched.id)).toEqual(untouched);
    const saved=await service.getShift(storeId,result.shiftIds[0]);
    const edited=await service.updateShift(saved.id,{...value.shifts[0].value,storeId,rosterPeriodId:saved.rosterPeriodId,version:saved.version,endAt:from+'T20:00:00Z'},'account');
    expect(edited.endAt).toBe(from+'T20:00:00.000Z');
    await service.deleteShift(saved.id,storeId,edited.version);
    expect((await service.calendar(storeId,from,to)).shifts.some(s=>s.id===saved.id)).toBe(false);
    expect(await service.getShift(storeId,untouched.id)).toEqual(untouched);
    // A retry after a human deletion must never recreate the deleted shift.
    expect(await service.applyAgentCalendar(value,'account')).toMatchObject({alreadyApplied:true});
    expect((await service.calendar(storeId,from,to)).shifts.some(s=>s.id===saved.id)).toBe(false);
  });
  it('records an empty best-effort result without inventing a shift or deleting later manual work',async()=>{
    const createManual=()=>service.createShiftWithPeriod({storeId,date:from,targetStartDate:from,targetEndDate:to,startAt:from+'T12:00:00Z',endAt:from+'T18:00:00Z',breakMinutes:0,shiftRoleId:roleId,assignments:[assignment]},'account');
    const old=await createManual();
    const empty=await plan();empty.applyDates=[from];empty.shifts=[];
    const saved=await service.applyAgentCalendar(empty,'account');
    expect(saved).toMatchObject({created:0,deleted:1,shiftIds:[]});
    expect((await service.calendar(storeId,from,to)).shifts.some(s=>s.id===old.id)).toBe(false);
    expect(await service.agentApplicationReceipt(storeId,empty.runId,'account')).toMatchObject({created:0,shiftIds:[]});
    const manual=await createManual();
    expect(await service.applyAgentCalendar(empty,'account')).toMatchObject({created:0,alreadyApplied:true});
    expect((await service.getShift(storeId,manual.id)).id).toBe(manual.id);
  });
});
