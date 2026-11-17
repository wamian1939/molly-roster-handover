import { Router } from "express";
import { z } from "zod";
import { getAuth, requireStore } from "./auth.js";
import { HttpError } from "./httpError.js";
import { dateString, storeIdSchema } from "./validation.js";

const scope = z.object({ storeId: storeIdSchema }).strict();
const input = scope.extend({ startDate: dateString, endDate: dateString, preserveExisting: z.enum(["true", "false"]).default("false") }).strict();
const run = scope.extend({ startDate: dateString, endDate: dateString, preserveExisting: z.boolean(), expectedRuleVersion: z.string().min(1), expectedSnapshotVersion: z.string().min(1),writeToCalendar:z.boolean().default(false) }).strict();
const band=z.object({start:z.string(),end:z.string(),staff:z.number().int().min(0).max(100)}).strict();
const settings=scope.extend({scope:z.enum(['DEFAULT','WEEK']),weekStart:dateString.nullable(),expectedVersion:z.number().int().min(0),baseRuleVersion:z.string().min(1),weekly:z.record(z.string(),z.array(band).min(1).max(48))}).strict();
const applyPayload=z.object({mode:z.enum(['FULL','PARTIAL_DRAFT']).default('FULL'),accepted_dates:z.array(dateString).default([]),
  daily_validation:z.object({valid:z.literal(true),validated_dates:z.array(dateString),shortfall_dates:z.array(dateString).default([])}).nullable().optional(),
  calendar_token:z.string().min(1),preserve_existing:z.boolean(),start_date:dateString,end_date:dateString,result:z.object({
  run_id:z.uuid(),source:z.literal('REAL'),status:z.enum(['DRAFT_VALIDATED','FAILED']),validation:z.object({valid:z.boolean()}),
  calendar:z.object({storeId:z.string(),from:dateString,to:dateString,shifts:z.array(z.object({
    id:z.string(),storeId:z.string(),date:dateString,startAt:z.string(),endAt:z.string(),breakMinutes:z.literal(0),shiftRoleId:z.string(),
    sourceShiftId:z.string().nullable(),locked:z.boolean(),patternName:z.string(),assignments:z.array(z.object({employeeId:z.string()})).min(1),
  })).max(500)}),
})});
export type AgentWritePayload=z.infer<typeof applyPayload>;
type WriteHooks={token:(store:string,from:string,to:string)=>Promise<string>;receipt:(store:string,id:string,account:string)=>Promise<unknown|null>;apply:(payload:AgentWritePayload,cookie:string,accountId:string)=>Promise<unknown>};

// Explicit routes only: never expose the Lab's anonymous fixtures or capability URLs.
export function createMultiAgentRouter(fetchImpl: typeof fetch = fetch,writes?:WriteHooks) {
  const router = Router();
  const writeStates=new Map<string,{status:'PENDING'|'APPLIED'|'FAILED';message?:string;receipt?:unknown}>();
  async function upstream(path: string, cookie: string | undefined, body?: unknown) {
    const session = cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith("evaluate_molly_session=") && s.length > 23);
    if (!session) throw new HttpError(401, "请先登录");
    let response: Response;
    try {
      // 4190 is a Fetch forbidden port; use 4191 for Node and browser compatibility.
      response = await fetchImpl(`${(process.env.MULTI_AGENT_ENGINE_URL || "http://127.0.0.1:4191").replace(/\/$/, "")}/multi-api/roster${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
        headers: { cookie: session, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      if (!response.ok) {
        const validationMessage=Array.isArray(data.detail)?data.detail.find((issue:unknown)=>typeof issue==='object'&&issue!==null&&'msg' in issue&&typeof issue.msg==='string')?.msg:null;
        const detail = typeof data.detail === "string" ? data.detail : typeof validationMessage==='string'?validationMessage.replace(/^Value error, /,''):"智能体排班请求未通过，请检查输入或重新加载";
        throw new HttpError(response.status, detail);
      }
      return data;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "智能体排班服务暂时无法连接，请启动引擎后重试");
    }
  }
  async function apply(id:string,storeId:string,cookie:string,accountId:string) {
    if(!writes)throw new HttpError(503,'日历写入服务未配置');
    const receipt=await writes.receipt(storeId,id,accountId);
    if(receipt)return receipt;
    const raw=await upstream(`/runs/${id}/apply-payload?store_id=${encodeURIComponent(storeId)}`,cookie,{allow_partial:true});
    const parsed=applyPayload.safeParse(raw);
    if(!parsed.success)throw new HttpError(409,'该排班未通过完整验证，不能写入日历');
    const data=parsed.data;
    if(data.mode==='FULL'&&(data.result.status!=='DRAFT_VALIDATED'||!data.result.validation.valid))throw new HttpError(409,'完整排班未通过验证');
    if(data.mode==='PARTIAL_DRAFT'){
      const accepted=new Set(data.accepted_dates);
      const checked=new Set(data.daily_validation?.validated_dates??[]);
      if(data.result.status!=='FAILED'||data.result.validation.valid||!data.daily_validation?.valid||!accepted.size||accepted.size!==data.accepted_dates.length
        ||checked.size!==accepted.size||[...accepted].some(d=>!checked.has(d)||d<data.start_date||d>data.end_date)
        ||data.daily_validation.shortfall_dates.some(d=>!accepted.has(d))
        ||data.result.calendar.shifts.some(s=>!accepted.has(s.date)))throw new HttpError(409,'部分日期未通过独立验证，不能保存');
    }
    if(data.result.run_id!==id||data.result.calendar.storeId!==storeId||data.result.calendar.from!==data.start_date||data.result.calendar.to!==data.end_date
      ||data.result.calendar.shifts.some(s=>s.storeId!==storeId||s.date<data.start_date||s.date>data.end_date))throw new HttpError(409,'候选排班的门店或日期不一致');
    return writes.apply(data,cookie,accountId);
  }
  function scheduleWrite(id:string,storeId:string,cookie:string,accountId:string) {
    if(writeStates.has(id))return;
    writeStates.set(id,{status:'PENDING'});
    void (async()=>{
      const deadline=Date.now()+45*60*1000;
      while(Date.now()<deadline){
        const state=await upstream(`/runs/${id}?store_id=${encodeURIComponent(storeId)}`,cookie);
        if(state.status==='DRAFT_VALIDATED'||(state.status==='FAILED'&&state.calendar_preview?.accepted_dates?.length)){
          const receipt=await apply(id,storeId,cookie,accountId);writeStates.set(id,{status:'APPLIED',receipt});return;
        }
        if(state.status!=='RUNNING')throw new HttpError(409,'排班未通过全周验证，当前日历未修改');
        await new Promise<void>(resolve=>{const timer=setTimeout(resolve,1500);timer.unref();});
      }
      throw new HttpError(503,'排班任务超时，请查看任务状态后重试写入');
    })().catch(error=>{writeStates.set(id,{status:'FAILED',message:error instanceof HttpError?error.message:'写入尚未确认，请重新连接任务检查日历'});});
  }
  router.get("/health", async (req, res) => {
    getAuth(req);
    res.json(await upstream("/health", req.header("cookie")));
  });
  router.get("/inputs", async (req, res) => {
    const q = input.parse(req.query); requireStore(getAuth(req), q.storeId);
    const query = new URLSearchParams({ store_id: q.storeId, start_date: q.startDate, end_date: q.endDate, preserve_existing: q.preserveExisting });
    res.json(await upstream(`/inputs?${query}`, req.header("cookie")));
  });
  router.get('/rules',async(req,res)=>{
    const q=scope.extend({weekStart:dateString}).strict().parse(req.query);requireStore(getAuth(req),q.storeId);
    res.json(await upstream(`/rules?${new URLSearchParams({store_id:q.storeId,week_start:q.weekStart})}`,req.header('cookie')));
  });
  router.post('/rules',async(req,res)=>{
    const p=settings.parse(req.body);requireStore(getAuth(req),p.storeId);
    res.json(await upstream('/rules',req.header('cookie'),{store_id:p.storeId,scope:p.scope,week_start:p.weekStart,
      expected_version:p.expectedVersion,base_rule_version:p.baseRuleVersion,weekly:p.weekly}));
  });
  router.post("/runs", async (req, res) => {
    const p = run.parse(req.body); requireStore(getAuth(req), p.storeId);
    if(p.writeToCalendar&&!writes)throw new HttpError(503,'日历写入服务未配置');
    const token=p.writeToCalendar?await writes!.token(p.storeId,p.startDate,p.endDate):null;
    const body = { store_id: p.storeId, start_date: p.startDate, end_date: p.endDate, preserve_existing: p.preserveExisting,
      expected_rule_version: p.expectedRuleVersion, expected_snapshot_version: p.expectedSnapshotVersion,...(token?{calendar_token:token}:{}) };
    const result=await upstream("/runs", req.header("cookie"), body);
    if(p.writeToCalendar)scheduleWrite(z.uuid().parse(result.run_id),p.storeId,req.header('cookie')!,getAuth(req).accountId);
    res.status(202).json(result);
  });
  router.post('/runs/:runId/apply',async(req,res)=>{
    const p=scope.parse(req.body);const auth=getAuth(req);requireStore(auth,p.storeId);
    const id=z.uuid().parse(req.params.runId);
    await upstream(`/runs/${id}?store_id=${encodeURIComponent(p.storeId)}`,req.header('cookie'));
    const receipt=await apply(id,p.storeId,req.header('cookie')!,auth.accountId);
    writeStates.set(id,{status:'APPLIED',receipt});res.json(receipt);
  });
  router.get("/latest", async (req, res) => {
    const q = scope.parse(req.query); requireStore(getAuth(req), q.storeId);
    res.json(await upstream(`/latest?store_id=${encodeURIComponent(q.storeId)}`, req.header("cookie")));
  });
  router.get('/recent-run',async(req,res)=>{
    const q=scope.parse(req.query);requireStore(getAuth(req),q.storeId);
    res.json(await upstream(`/runs-recent?store_id=${encodeURIComponent(q.storeId)}`,req.header('cookie')));
  });
  for (const suffix of ["", "/export"]) {
    router.get(`/runs/:runId${suffix}`, async (req, res) => {
      const q = scope.parse(req.query); requireStore(getAuth(req), q.storeId);
      const id = z.uuid().parse(req.params.runId);
      const state=await upstream(`/runs/${id}${suffix}?store_id=${encodeURIComponent(q.storeId)}`, req.header("cookie"));
      if(!suffix&&state.calendar_token)scheduleWrite(id,q.storeId,req.header('cookie')!,getAuth(req).accountId);
      res.json({...state,...(!suffix?{calendar_write:writeStates.get(id)??null}:{})});
    });
  }
  return router;
}
