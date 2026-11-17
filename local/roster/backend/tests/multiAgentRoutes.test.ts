import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { requireEvaluateAuth } from "../src/auth.js";
import { createMultiAgentRouter } from "../src/multiAgentRoutes.js";
import { HttpError } from "../src/httpError.js";

function fixture(upstream = vi.fn(async () => new Response(JSON.stringify({ ok: true }))),writes?:Parameters<typeof createMultiAgentRouter>[1]) {
  const evaluate = { me: vi.fn(async (cookie: string) => {
    if (!cookie) throw new HttpError(401, "请先登录");
    return { accountId:'account',role: "STORE_EVALUATOR", storeIds: ["hurstville"] };
  }) };
  const app = express(); app.use(express.json()); app.use(requireEvaluateAuth(evaluate as never));
  app.use("/api/multi-agent", createMultiAgentRouter(upstream as never,writes));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res.status(error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 500).json({ message: error instanceof Error ? error.message : "failed" });
  });
  return { app, upstream };
}
const cookie = "evaluate_molly_session=real-session-shaped-fixture; unrelated=private";
const query = "storeId=hurstville&startDate=2026-10-26&endDate=2026-11-01&preserveExisting=false";

describe("authenticated Multi-Agent gateway", () => {
  it('scopes recent-task recovery to the signed-in user and authorized store',async()=>{
    const {app,upstream}=fixture();
    await request(app).get('/api/multi-agent/recent-run?storeId=another-store').set('cookie',cookie).expect(403);
    expect(upstream).not.toHaveBeenCalled();
    await request(app).get('/api/multi-agent/recent-run?storeId=hurstville').set('cookie',cookie).expect(200);
    expect(String(upstream.mock.calls[0][0])).toContain('/multi-api/roster/runs-recent?store_id=hurstville');
  });
  it("rejects anonymous and other-store requests before reaching the engine", async () => {
    const { app, upstream } = fixture();
    await request(app).get(`/api/multi-agent/inputs?${query}`).expect(401);
    await request(app).get("/api/multi-agent/latest?storeId=another-store").set("cookie", cookie).expect(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards only the session cookie and an explicit real-input route", async () => {
    const { app, upstream } = fixture();
    await request(app).get(`/api/multi-agent/inputs?${query}`).set("cookie", cookie).expect(200);
    expect(upstream.mock.calls[0]).toEqual([expect.stringContaining("/multi-api/roster/inputs?store_id=hurstville"), expect.objectContaining({ headers: { cookie: "evaluate_molly_session=real-session-shaped-fixture", "content-type": "application/json" }, redirect: "error" })]);
    expect(String(upstream.mock.calls[0][0])).toContain("preserve_existing=false");
  });
  it("does not accept browser-injected policy, fixture mode or publishing options", async () => {
    const { app, upstream } = fixture();
    const body = { storeId: "hurstville", startDate: "2026-10-26", endDate: "2026-11-01", preserveExisting: false, expectedRuleVersion: "v20", expectedSnapshotVersion: "s1", source: "MOCK", policy: { fairness_weight: 1 } };
    await request(app).post("/api/multi-agent/runs").set("cookie", cookie).send(body).expect(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("passes validated scope and optimistic input versions on task creation", async () => {
    const { app, upstream } = fixture();
    await request(app).post("/api/multi-agent/runs").set("cookie", cookie).send({ storeId: "hurstville", startDate: "2026-10-26", endDate: "2026-11-01", preserveExisting: true, expectedRuleVersion: "v20", expectedSnapshotVersion: "s1" }).expect(202);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ store_id: "hurstville", start_date: "2026-10-26", end_date: "2026-11-01", preserve_existing: true, expected_rule_version: "v20", expected_snapshot_version: "s1" });
  });
  it("preserves actionable validation conflicts and sanitizes network errors", async () => {
    const network = fixture(vi.fn(async () => { throw new Error("token=secret"); }));
    const response = await request(network.app).get("/api/multi-agent/health").set("cookie", cookie).expect(503);
    expect(response.text).not.toContain("secret");
    const conflict = fixture(vi.fn(async () => new Response(JSON.stringify({ detail: "规则已变化" }), { status: 409 })));
    await request(conflict.app).get("/api/multi-agent/latest?storeId=hurstville").set("cookie", cookie).expect(409, { message: "规则已变化" });
  });
  it('continues a calendar write on the backend after the generation request returns',async()=>{
    const id='5df10515-8d69-41d6-bd5c-4e7e083198d0';
    const writes={token:vi.fn(async()=>'calendar-token'),receipt:vi.fn(async()=>null),apply:vi.fn(async()=>({applied:true,created:1,deleted:0}))};
    const upstream=vi.fn(async(url:string,init?:RequestInit)=>{
      const response=url.includes('/apply-payload')?{calendar_token:'calendar-token',preserve_existing:false,start_date:'2026-10-26',end_date:'2026-11-01',result:{run_id:id,source:'REAL',status:'DRAFT_VALIDATED',validation:{valid:true},calendar:{storeId:'hurstville',from:'2026-10-26',to:'2026-11-01',shifts:[{id:'s1',storeId:'hurstville',date:'2026-10-26',startAt:'2026-10-26T10:00:00Z',endAt:'2026-10-26T22:00:00Z',breakMinutes:0,shiftRoleId:'role',sourceShiftId:null,locked:false,patternName:'Full',assignments:[{employeeId:'real-id-shaped-fixture'}]}]}}}
        :init?.method==='POST'?{run_id:id,status:'RUNNING'}:{status:'DRAFT_VALIDATED',calendar_token:'calendar-token'};
      return new Response(JSON.stringify(response));
    });
    const {app}=fixture(upstream as never,writes);
    await request(app).post('/api/multi-agent/runs').set('cookie',cookie).send({storeId:'hurstville',startDate:'2026-10-26',endDate:'2026-11-01',preserveExisting:false,expectedRuleVersion:'v20',expectedSnapshotVersion:'s1',writeToCalendar:true}).expect(202);
    for(let i=0;i<100&&!writes.apply.mock.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
    expect(writes.apply).toHaveBeenCalledOnce();
    expect(JSON.parse(upstream.mock.calls[0][1]!.body as string).calendar_token).toBe('calendar-token');
    const status=await request(app).get(`/api/multi-agent/runs/${id}?storeId=hurstville`).set('cookie',cookie).expect(200);
    expect(status.body.calendar_write.status).toBe('APPLIED');
  });
  it('never writes a partial or failed run, and refuses browser-supplied candidate JSON',async()=>{
    const id='5df10515-8d69-41d6-bd5c-4e7e083198d0';
    const writes={token:vi.fn(async()=>'token'),receipt:vi.fn(async()=>null),apply:vi.fn()};
    const upstream=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='POST'?{run_id:id,status:'RUNNING'}:{status:'FAILED',calendar_token:'token'})));
    const {app}=fixture(upstream as never,writes);
    await request(app).post('/api/multi-agent/runs').set('cookie',cookie).send({storeId:'hurstville',startDate:'2026-10-26',endDate:'2026-11-01',preserveExisting:false,expectedRuleVersion:'v20',expectedSnapshotVersion:'s1',writeToCalendar:true}).expect(202);
    await new Promise(resolve=>setTimeout(resolve,10));
    const status=await request(app).get(`/api/multi-agent/runs/${id}?storeId=hurstville`).set('cookie',cookie).expect(200);
    expect(status.body.calendar_write.status).toBe('FAILED');expect(writes.apply).not.toHaveBeenCalled();
    await request(app).post(`/api/multi-agent/runs/${id}/apply`).set('cookie',cookie).send({storeId:'hurstville',result:{status:'DRAFT_VALIDATED'}}).expect(400);
  });
  it('saves independently verified days as editable drafts while retaining the failed week status',async()=>{
    const id='5df10515-8d69-41d6-bd5c-4e7e083198d0';
    const writes={token:vi.fn(async()=>'token'),receipt:vi.fn(async()=>null),apply:vi.fn(async()=>({applied:true,created:1,deleted:0}))};
    const accepted=['2026-10-26'];
    const upstream=vi.fn(async(url:string,init?:RequestInit)=>{
      const result=url.includes('/apply-payload')?{mode:'PARTIAL_DRAFT',accepted_dates:accepted,daily_validation:{valid:true,validated_dates:accepted,shortfall_dates:accepted},calendar_token:'token',preserve_existing:false,start_date:'2026-10-26',end_date:'2026-11-01',result:{run_id:id,source:'REAL',status:'FAILED',validation:{valid:false},calendar:{storeId:'hurstville',from:'2026-10-26',to:'2026-11-01',shifts:[{id:'s1',storeId:'hurstville',date:'2026-10-26',startAt:'2026-10-26T10:00:00Z',endAt:'2026-10-26T22:00:00Z',breakMinutes:0,shiftRoleId:'role',sourceShiftId:null,locked:false,patternName:'Full',assignments:[{employeeId:'employee'}]}]}}}
        :init?.method==='POST'?{run_id:id,status:'RUNNING'}:{status:'FAILED',calendar_token:'token',calendar_preview:{accepted_dates:accepted,shifts:[{id:'s1'}]}};
      return new Response(JSON.stringify(result));
    });
    const {app}=fixture(upstream as never,writes);
    await request(app).post('/api/multi-agent/runs').set('cookie',cookie).send({storeId:'hurstville',startDate:'2026-10-26',endDate:'2026-11-01',preserveExisting:false,expectedRuleVersion:'v20',expectedSnapshotVersion:'s1',writeToCalendar:true}).expect(202);
    for(let i=0;i<100&&!writes.apply.mock.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
    expect(writes.apply).toHaveBeenCalledWith(expect.objectContaining({mode:'PARTIAL_DRAFT',accepted_dates:accepted,daily_validation:{valid:true,validated_dates:accepted,shortfall_dates:accepted},result:expect.objectContaining({status:'FAILED',validation:{valid:false}})}),expect.any(String),'account');
    const state=await request(app).get(`/api/multi-agent/runs/${id}?storeId=hurstville`).set('cookie',cookie).expect(200);
    expect(state.body.status).toBe('FAILED');expect(state.body.calendar_write.status).toBe('APPLIED');
  });
  it('rejects a partial payload when serialized shifts escape the validated dates',async()=>{
    const id='5df10515-8d69-41d6-bd5c-4e7e083198d0';
    const writes={token:vi.fn(),receipt:vi.fn(async()=>null),apply:vi.fn()};
    const upstream=vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('/apply-payload')?{mode:'PARTIAL_DRAFT',accepted_dates:['2026-10-26'],daily_validation:{valid:true,validated_dates:['2026-10-26']},calendar_token:'token',preserve_existing:false,start_date:'2026-10-26',end_date:'2026-11-01',result:{run_id:id,source:'REAL',status:'FAILED',validation:{valid:false},calendar:{storeId:'hurstville',from:'2026-10-26',to:'2026-11-01',shifts:[{id:'bad',storeId:'hurstville',date:'2026-10-27',startAt:'2026-10-27T10:00:00Z',endAt:'2026-10-27T22:00:00Z',breakMinutes:0,shiftRoleId:'role',sourceShiftId:null,locked:false,patternName:'Full',assignments:[{employeeId:'employee'}]}]}}}:{status:'FAILED'})));
    const {app}=fixture(upstream as never,writes);
    await request(app).post(`/api/multi-agent/runs/${id}/apply`).set('cookie',cookie).send({storeId:'hurstville'}).expect(409);
    expect(writes.apply).not.toHaveBeenCalled();
  });
});
