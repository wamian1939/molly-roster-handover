import {paidMinutes,hours} from './payroll/preparation.js';
import { Router } from "express";
import { z } from "zod";
import { getSetCookieHeaders, readJson, verifiedAuthUser, type EvaluateClient } from "./evaluateClient.js";
import { HttpError } from "./httpError.js";
import { assertRoleAssociationUnchanged, matchFormalRoles, qualifiedEmployeeIdsByRole } from "./formalRoleMatch.js";
import { evaluateJobColor } from "./evaluateJobColor.js";
import { SchedulingError } from "./schedulingIssue.js";
import { getAuth, requireAdmin, requireEvaluateAuth, requireStore } from "./auth.js";
import { RosterService, type AssignmentSnapshot, type DraftCommitChange } from "./rosterService.js";
import { prisma } from "./prisma.js";
import { dateString, isoDateTime, storeIdSchema } from "./validation.js";
import { parsePresetTimeSlotScript } from "./presetTimeSlotScript.js";
import { presetTimeSlotFingerprint, presetTimeSlotPreviewFingerprint, previewPresetTimeSlots } from "./presetTimeSlotPreview.js";
import { presetTimeSlotReviewFingerprint } from "./presetTimeSlotReview.js";
import { createMultiAgentRouter } from "./multiAgentRoutes.js";

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
const rangeSchema = z.object({ storeId: storeIdSchema, from: dateString, to: dateString })
  .refine((value) => value.from <= value.to, { message: "结束日期不能早于开始日期" })
  .refine((value) => (Date.parse(`${value.to}T00:00:00.000Z`) - Date.parse(`${value.from}T00:00:00.000Z`)) / 86_400_000 < 366,
    { message: "每次最多查询连续 366 天" });
const periodSchema = z.object({ storeId: storeIdSchema, startDate: dateString, endDate: dateString, cycleType: z.enum(["WEEK", "FORTNIGHT"]) });
const shiftCreateSchema = z.object({
  storeId: storeIdSchema,
  rosterPeriodId: z.string().min(1),
  date: dateString,
  startAt: isoDateTime,
  endAt: isoDateTime,
  breakMinutes: z.number().int().min(0).max(720),
  shiftRoleId: z.string().min(1),
  publicNote: z.string().max(500).nullish(),
  internalNote: z.string().max(1000).nullish(),
  employeeIds: z.array(z.string().min(1)).min(1, "请至少选择一名员工").max(100).refine((ids) => new Set(ids).size === ids.length, "员工不能重复选择"),
});
const shiftUpdateSchema = shiftCreateSchema.extend({ version: z.number().int().positive() });
const shiftCreateWithPeriodSchema = shiftCreateSchema.omit({ rosterPeriodId: true }).extend({ targetStartDate: dateString, targetEndDate: dateString, clientShiftId: z.uuid().optional() });
const shiftRepositionSchema = z.object({ storeId: storeIdSchema, date: dateString, startAt: isoDateTime, endAt: isoDateTime, targetStartDate: dateString, targetEndDate: dateString, version: z.number().int().positive(), sourceEmployeeId: z.string().min(1).optional(), targetEmployeeId: z.string().min(1).optional() })
  .refine((value) => Boolean(value.sourceEmployeeId) === Boolean(value.targetEmployeeId), "更换员工时须同时提供来源与目标员工");
const shiftDeleteSchema = z.object({ storeId: storeIdSchema, version: z.coerce.number().int().positive() });
const draftValueSchema = shiftCreateSchema.omit({ storeId: true, rosterPeriodId: true });
const draftCommitSchema = z.object({
  storeId: storeIdSchema,
  rosterPeriodId: z.string().min(1),
  changes: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("create"), clientShiftId: z.uuid(), value: draftValueSchema }),
    z.object({ kind: z.literal("update"), shiftId: z.string().min(1), baseVersion: z.number().int().positive(), value: draftValueSchema }),
    z.object({ kind: z.literal("delete"), shiftId: z.string().min(1), baseVersion: z.number().int().positive() }),
  ])).min(1).max(100),
});
const availabilityQuerySchema = rangeSchema.extend({ employeeId: z.string().min(1).optional() });
const availabilitySchema = z.object({
  storeId: storeIdSchema,
  employeeId: z.string().min(1),
  dates: z.array(dateString).min(1).max(31).refine((dates) => new Set(dates).size === dates.length, "日期不能重复"),
  expectedRows: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).max(93),
  entries: z.array(z.object({
    date: dateString,
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
    startAt: isoDateTime.nullish(),
    endAt: isoDateTime.nullish(),
    note: z.string().max(500).nullish(),
    source: z.enum(["MANUAL", "TEMPLATE"]).optional(),
  })).max(93),
}).superRefine((value, context) => {
  const dates = new Set(value.dates);
  for (const [index, entry] of value.entries.entries()) {
    if (!dates.has(entry.date)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entries", index, "date"], message: "可用时间日期不在本次替换范围内" });
  }
});
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间必须使用 HH:mm 格式");
const presetShortcutSchema = z.object({ code: z.string().min(1).max(20), startTime: clockTime, endTime: clockTime });
const presetShortcutSaveSchema = z.object({
  storeId: storeIdSchema,
  shortcuts: z.array(presetShortcutSchema).min(1).max(30),
  version: z.number().int().positive().optional(),
});
const presetScriptPreviewSchema = z.object({
  storeId: storeIdSchema,
  week: z.enum(["CURRENT", "NEXT"]),
  script: z.string().min(1).max(20_000),
  expectedShortcutsVersion: z.number().int().positive().optional(),
  employeeMappings: z.array(z.object({ nickname: z.string().trim().min(1).max(100), employeeId: z.string().min(1).max(100) })).max(100).optional(),
});
const presetScriptCommitSchema = presetScriptPreviewSchema.extend({
  previewHash: z.string().regex(/^[0-9a-f]{64}$/),
  expectedSlotStatusHash: z.string().regex(/^[0-9a-f]{64}$/),
  expectedCreateCount: z.number().int().positive(),
  expectedUnchangedCount: z.number().int().nonnegative(),
});
const colorToken = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是六位十六进制值");
const roleCreateSchema = z.object({ storeId: storeIdSchema, code: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/), nameZh: z.string().trim().min(1).max(80), colorToken: colorToken.optional(), requiredSkillCodes: z.array(z.string().min(1)).max(50).default([]), displayOrder: z.number().int().min(0).max(10000).optional() });
const roleUpdateSchema = roleCreateSchema.omit({ code: true }).extend({ isActive: z.boolean(), displayOrder: z.number().int().min(0).max(10000), version: z.number().int().positive() });
const roleListSchema = z.object({ storeId: storeIdSchema, includeInactive: z.enum(["true", "false"]).optional().default("false") });
const templateCreateSchema = z.object({ storeId: storeIdSchema, name: z.string().trim().min(1).max(80), startTime: clockTime, endTime: clockTime, breakMinutes: z.number().int().min(0).max(720), shiftRoleId: z.string().min(1).nullish(), displayOrder: z.number().int().min(0).max(10000).optional() });
const templateUpdateSchema = templateCreateSchema.extend({ isActive: z.boolean(), displayOrder: z.number().int().min(0).max(10000), version: z.number().int().positive() });
const availabilitySlotSchema = z.object({ dayOffset: z.number().int().min(0).max(13), status: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]), startTime: clockTime.nullish(), endTime: clockTime.nullish(), endNextDay: z.boolean().optional().default(false) }).superRefine((slot, context) => {
  if (slot.status === "UNKNOWN" && (slot.startTime || slot.endTime || slot.endNextDay)) context.addIssue({ code: z.ZodIssueCode.custom, message: "未知时段不能包含时间" });
  if (slot.status !== "UNKNOWN" && (!slot.startTime || !slot.endTime || (!slot.endNextDay && slot.startTime >= slot.endTime) || (slot.endNextDay && slot.endTime > slot.startTime))) context.addIssue({ code: z.ZodIssueCode.custom, message: "结束时间必须晚于开始时间，次日结束最长为 24 小时" });
});
const availabilityTemplateCreateSchema = z.object({ storeId: storeIdSchema, name: z.string().trim().min(1).max(80), slots: z.array(availabilitySlotSchema).min(1).max(56), displayOrder: z.number().int().min(0).max(10000).optional() }).superRefine((value, context) => {
  const countsByDay = new Map<number, number>();
  for (const slot of value.slots) countsByDay.set(slot.dayOffset, (countsByDay.get(slot.dayOffset) ?? 0) + 1);
  if (value.slots.some((slot) => slot.status === "UNKNOWN" && countsByDay.get(slot.dayOffset)! > 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["slots"], message: "同一天的未知可用时间不能与其他时段并存或重复" });
  }
  const minute = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  const timed = value.slots.filter((slot) => slot.status !== "UNKNOWN" && slot.startTime && slot.endTime)
    .map((slot) => ({ start: slot.dayOffset * 1440 + minute(slot.startTime!), end: (slot.dayOffset + Number(slot.endNextDay)) * 1440 + minute(slot.endTime!) }))
    .sort((left, right) => left.start - right.start);
  let latestEnd = timed[0]?.end ?? 0;
  for (let index = 1; index < timed.length; index += 1) {
    const current = timed[index]!;
    if (current.start < latestEnd) context.addIssue({ code: z.ZodIssueCode.custom, path: ["slots"], message: "可用时间段不能重叠，包括跨日时段" });
    latestEnd = Math.max(latestEnd, current.end);
  }
});
const availabilityTemplateUpdateSchema = availabilityTemplateCreateSchema.safeExtend({ isActive: z.boolean(), displayOrder: z.number().int().min(0).max(10000), version: z.number().int().positive() });
const settingsSchema = z.object({ storeId: storeIdSchema, timezone: z.string().min(1).max(100), openingTime: clockTime, closingTime: clockTime, slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]), minimumShiftMinutes: z.number().int().min(15).max(1440), defaultBreakMinutes: z.number().int().min(0).max(720), weekStartsOn: z.number().int().min(0).max(6), cycleType: z.enum(["WEEK", "FORTNIGHT"]), fortnightAnchorDate: dateString.nullable().optional(), weeklyHourWarning: z.number().int().min(1).max(168), dailyHourWarning: z.number().int().min(1).max(24), version: z.number().int().positive().optional() });
const versionBodySchema = z.object({ storeId: storeIdSchema, version: z.number().int().positive() });
const copySchema = z.object({ storeId: storeIdSchema, sourcePeriodId: z.string().min(1), targetStartDate: dateString });
const copyExecuteSchema = copySchema.extend({ expectedSourcePeriodVersion: z.number().int().positive() });
const copyDaySchema = z.object({ storeId: storeIdSchema, sourceDate: dateString, targetDate: dateString });
const copyDayExecuteSchema = copyDaySchema.extend({ expectedSourcePeriodVersion: z.number().int().positive().nullable(), expectedTargetPeriodVersion: z.number().int().positive().nullable() });
const repeatSchema = z.object({ storeId: storeIdSchema, sourceShiftId: z.string().min(1), targetDates: z.array(dateString).min(1).max(42).refine((dates) => new Set(dates).size === dates.length, "目标日期不能重复") });
const repeatExecuteSchema = repeatSchema.extend({ expectedSourcePeriodVersion: z.number().int().positive().nullable(), expectedTargetPeriodVersions: z.array(z.object({ date: dateString, version: z.number().int().positive().nullable() })).min(1).max(42) });
const exportSchema = z.object({ storeId: storeIdSchema, periodId: z.string().min(1).optional(), publicationId: z.string().min(1).optional(), audience: z.enum(["employee", "manager"]) }).refine((value) => Number(Boolean(value.periodId)) + Number(Boolean(value.publicationId)) === 1, "必须且只能选择当前排班或一个发布版本");
const publicationQuerySchema = z.object({ storeId: storeIdSchema });
const publicationDetailQuerySchema = publicationQuerySchema.extend({ audience: z.enum(["employee", "manager"]).default("employee") });
const batchItemsSchema = z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).min(1).max(500).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "班次不能重复");
const batchDeleteSchema = z.object({ storeId: storeIdSchema, items: batchItemsSchema });
const batchUpdateSchema = z.object({ storeId: storeIdSchema, items: batchItemsSchema, patch: z.object({ shiftRoleId: z.string().min(1).optional(), breakMinutes: z.number().int().min(0).max(720).optional(), publicNote: z.string().max(500).nullish() }).refine((patch) => Object.keys(patch).length > 0, "请至少提供一个更新字段") });
const officialScoreSchema = z.object({ score: z.number().min(0).max(100), tier: z.enum(["T1", "T2", "T3", "T4", "T5"]), roundId: z.string(), closedAt: z.string() });
const externalEmployeeSchema = z.object({
  id: z.string(), displayName: z.string(), employeeType: z.enum(["REGULAR", "TRAINING"]), employmentType: z.string().nullable(), storeId: z.string(), storeName: z.string(), isActive: z.boolean(), officialScore: officialScoreSchema.nullable(),
  positions: z.array(z.object({ id: z.string(), code: z.string().nullable(), name: z.string() })).optional(),
  skillSummary: z.object({ overallPercent: z.number().nullable(), backOfHousePercent: z.number().nullable(), waterBarPercent: z.number().nullable(), frontOfHousePercent: z.number().nullable(), qualifiedSkillCodes: z.array(z.string()), skills: z.array(z.object({ code: z.string(), nameZh: z.string(), category: z.string(), mode: z.enum(["PROGRESSIVE", "BINARY"]), status: z.enum(["NotTrained", "Training", "Independent", "Proficient", "Unknown", "CannotDo", "CanDo"]), updatedAt: z.string() })), operations: z.object({ opening: z.enum(["UNKNOWN", "CAN_DO", "CANNOT_DO"]), closing: z.enum(["UNKNOWN", "CAN_DO", "CANNOT_DO"]), weeklyCleaning: z.enum(["UNKNOWN", "CAN_DO", "CANNOT_DO"]) }) }),
});
const employeeEnvelopeSchema = z.object({ contractVersion: z.string(), generatedAt: z.string(), employees: z.array(externalEmployeeSchema), workforceRevision: z.string().optional(), pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), hasMore: z.boolean() }).optional() });
const singleEmployeeEnvelopeSchema = z.object({ contractVersion: z.string(), generatedAt: z.string(), employee: externalEmployeeSchema.nullable() });
const storeEnvelopeSchema = z.object({ contractVersion: z.string(), generatedAt: z.string(), stores: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })) });
const skillCatalogEnvelopeSchema = z.object({ skills: z.array(z.object({ code: z.string().min(1), nameZh: z.string(), category: z.string(), skillMode: z.enum(["PROGRESSIVE", "BINARY"]) })) });
const storeJobsSchema = z.array(z.object({ id: z.string().min(1), storeId: z.string().min(1), name: z.string().min(1), code: z.string().nullable(), colorToken: z.string(), displayOrder: z.number(), isActive: z.boolean() }));

export function createRouter(evaluate: EvaluateClient, roster = new RosterService(prisma)) {
  const router = Router();

  router.post("/auth/login", async (request, response) => {
    const payload = loginSchema.parse(request.body);
    const upstream = await evaluate.login(payload);
    const body = await readJson<{ user?: unknown }>(upstream);
    // A malformed 200 response must not create a browser session or pass an
    // unverified role/store scope to the React authentication context.
    const verifiedBody = upstream.ok ? { user: verifiedAuthUser(body?.user) } : body;
    for (const cookie of getSetCookieHeaders(upstream)) response.append("set-cookie", cookie);
    const retryAfter = upstream.headers.get("retry-after");
    if (upstream.status === 429 && retryAfter && /^\d+$/.test(retryAfter)) response.setHeader("Retry-After", retryAfter);
    response.status(upstream.status).json(verifiedBody);
  });

  router.get("/auth/me", async (request, response) => {
    response.json({ user: await evaluate.me(request.header("cookie")) });
  });

  router.post("/auth/logout", async (request, response) => {
    const upstream = await evaluate.logout(request.header("cookie"));
    for (const cookie of getSetCookieHeaders(upstream)) response.append("set-cookie", cookie);
    const body = await readJson(upstream);
    response.status(upstream.status).json(body);
  });

  router.use(requireEvaluateAuth(evaluate));
  router.use("/multi-agent", createMultiAgentRouter(fetch,{
    token:(store,from,to)=>roster.agentCalendarToken(store,from,to),
    receipt:(store,id,account)=>roster.agentApplicationReceipt(store,id,account),
    apply:async(payload,cookie,accountId)=>{
      const calendar=payload.result.calendar;
      const employeeIds=[...new Set(calendar.shifts.filter(s=>!s.locked).flatMap(s=>s.assignments.map(a=>a.employeeId)))];
      const {assignments,formal,qualified}=await currentAssignmentQualifications(evaluate,roster,calendar.storeId,employeeIds,cookie);
      const people=new Map(assignments.map(a=>[a.employeeId,a]));
      const shifts=calendar.shifts.map(s=>{
        const resolved=s.assignments.map(a=>people.get(a.employeeId)).filter((a):a is AssignmentSnapshot=>Boolean(a));
        if(!s.locked){
          if(resolved.length!==s.assignments.length||!formal.names[s.shiftRoleId])throw new HttpError(422,'候选员工或岗位已变化，请重新生成');
          assertQualifiedAssignments(s.shiftRoleId,resolved,qualified,calendar.storeId);
        }
        return {key:s.id,sourceShiftId:s.sourceShiftId,fixed:s.locked,value:{date:s.date,startAt:s.startAt,endAt:s.endAt,breakMinutes:0,
          shiftRoleId:s.shiftRoleId,formalRoleName:formal.names[s.shiftRoleId],formalRoleColor:formal.colors[s.shiftRoleId],
          publicNote:null,internalNote:`智能体排班 · ${s.patternName} · 休息尚未安排`,assignments:resolved}};
      });
      return roster.applyAgentCalendar({storeId:calendar.storeId,runId:payload.result.run_id,from:payload.start_date,to:payload.end_date,
        expectedToken:payload.calendar_token,preserveExisting:payload.preserve_existing,
        ...(payload.mode==='PARTIAL_DRAFT'?{applyDates:payload.accepted_dates}:{}),shifts},accountId);
    },
  }));
  router.use("/roster", async (request, _response, next) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
        const auth = getAuth(request);
        // Evaluate grants administrators access to all stores but their session
        // intentionally carries no store IDs. Recheck the active store before
        // any Roster mutation, including batch operations with no workforce read.
        if (auth.role === "ADMIN") {
          const rawStoreId = request.body?.storeId ?? request.query.storeId;
          if (typeof rawStoreId === "string") {
            const storeId = storeIdSchema.parse(rawStoreId);
            await currentStoreSnapshot(evaluate, storeId, request.header("cookie")!);
          }
        }
      }
      next();
    } catch (error) { next(error); }
  });
  router.get("/session", (request, response) => response.json({ ok: true }));

  router.get("/workforce/contract-version", async (request, response) => {
    response.json(await integrationBody(evaluate, "/contract-version", request.header("cookie")!));
  });
  router.get("/workforce/stores", async (request, response) => {
    const auth = getAuth(request);
    const stores = parseEvaluatePayload(storeEnvelopeSchema, await integrationBody(evaluate, "/stores", request.header("cookie")!), "门店清单");
    response.json({ ...stores, stores: stores.stores.filter((store) => auth.role === "ADMIN" || auth.storeIds.includes(store.id)) });
  });
  router.get("/workforce/stores/:storeId/employees", async (request, response) => {
    const auth = getAuth(request); requireStore(auth, request.params.storeId);
    response.json(await workforceEmployees(evaluate, request.params.storeId, request.header("cookie")!));
  });
  router.get("/workforce/skill-definitions", async (request, response) => {
    getAuth(request);
    const catalog = parseEvaluatePayload(skillCatalogEnvelopeSchema, await integrationBody(evaluate, "/skill-definitions", request.header("cookie")!), "技能目录");
    response.json({ skills: catalog.skills });
  });
  router.get("/workforce/stores/:storeId/jobs", async (request, response) => {
    const auth = getAuth(request); requireStore(auth, request.params.storeId);
    const jobs = await currentStoreJobs(evaluate, request.params.storeId, request.header("cookie")!);
    response.json({ jobs: jobs.filter((job) => job.isActive) });
  });
  router.get("/workforce/employees/:employeeId", async (request, response) => {
    const auth = getAuth(request);
    const payload = parseEvaluatePayload(singleEmployeeEnvelopeSchema, await integrationBody(evaluate, `/employees/${encodeURIComponent(request.params.employeeId)}`, request.header("cookie")!), "员工资料");
    if (!payload.employee) throw new HttpError(404, "员工不存在");
    if (payload.employee.id !== request.params.employeeId) throw new HttpError(503, "Evaluate 员工身份不一致，请稍后重试");
    requireStore(auth, payload.employee.storeId);
    response.json(payload);
  });

  router.get("/roster/periods", async (request, response) => {
    const query = rangeSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    response.json(await roster.listPeriods(query.storeId, query.from, query.to));
  });
  router.post("/roster/periods", async (request, response) => {
    const payload = periodSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    response.status(201).json(await roster.createPeriod(payload, auth.accountId));
  });
  router.get("/roster/periods/:periodId", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.getPeriod(storeId, request.params.periodId));
  });
  router.get("/roster/periods/:periodId/summary", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.periodSummary(storeId, request.params.periodId));
  });
  router.post("/roster/periods/:periodId/publish", async (request, response) => {
    const payload = versionBodySchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [store, workforce, jobs, roles] = await Promise.all([currentStoreSnapshot(evaluate, payload.storeId, cookie), workforceEmployees(evaluate, payload.storeId, cookie), currentStoreJobs(evaluate, payload.storeId, cookie), roster.listRoles(payload.storeId)]);
    const currentEmployees = workforce.employees.filter((employee) => employee.isActive).map(toAssignmentSnapshot);
    const formalRoles = matchFormalRoles(jobs, roles, payload.storeId);
    response.json(await roster.publishPeriod(payload.storeId, request.params.periodId, payload.version, { accountId: auth.accountId, displayName: auth.displayName }, store, currentEmployees, formalRoles.ids, formalRoles.names,
      qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors));
  });
  router.get("/roster/periods/:periodId/publications", async (request, response) => {
    const query = publicationQuerySchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    response.json(await roster.listPublications(query.storeId, request.params.periodId));
  });
  router.get("/roster/publications/:publicationId", async (request, response) => {
    const query = publicationDetailQuerySchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    if (query.audience === "manager") requireAdmin(auth);
    response.json(await roster.getPublication(query.storeId, request.params.publicationId, query.audience));
  });
  router.post("/roster/periods/:periodId/reopen", async (request, response) => {
    const payload = versionBodySchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    response.json(await roster.reopenPeriod(payload.storeId, request.params.periodId, payload.version));
  });
  router.post("/roster/batch/copy", async (request, response) => {
    const payload = copyExecuteSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    const currentAssignments = workforce.employees.filter((employee) => employee.isActive).map(toAssignmentSnapshot);
    response.status(201).json(await roster.copyPeriod({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId));
  });
  router.post("/roster/batch/copy/preview", async (request, response) => {
    const payload = copySchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    response.json(await roster.previewCopyPeriod({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }));
  });
  router.post("/roster/batch/copy-day/preview", async (request, response) => {
    const payload = copyDaySchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    response.json(await roster.previewCopyDay({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }));
  });
  router.post("/roster/batch/copy-day", async (request, response) => {
    const payload = copyDayExecuteSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    const currentAssignments = workforce.employees.filter((employee) => employee.isActive).map(toAssignmentSnapshot);
    response.status(201).json(await roster.copyDay({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId));
  });
  router.post("/roster/batch/repeat/preview", async (request, response) => {
    const payload = repeatSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    response.json(await roster.previewRepeatShift({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }));
  });
  router.post("/roster/batch/repeat", async (request, response) => {
    const payload = repeatExecuteSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    const currentAssignments = workforce.employees.filter((employee) => employee.isActive).map(toAssignmentSnapshot);
    response.status(201).json(await roster.repeatShift({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors,
      qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId));
  });
  router.post("/roster/batch/delete", async (request, response) => { const payload = batchDeleteSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId); response.json(await roster.batchDelete(payload.storeId, payload.items)); });
  router.post("/roster/batch/update", async (request, response) => {
    const payload = batchUpdateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    const formalRoleName = payload.patch.shiftRoleId ? formalRoles.names[payload.patch.shiftRoleId] : undefined;
    const formalRoleColor = payload.patch.shiftRoleId ? formalRoles.colors[payload.patch.shiftRoleId] : undefined;
    if (payload.patch.shiftRoleId && !formalRoleName) throw new HttpError(422, "班次岗位不在 Evaluate 当前门店的正式岗位清单中");
    response.json(await roster.batchUpdate(payload.storeId, payload.items, { ...payload.patch, ...(formalRoleName ? { formalRoleName } : {}), ...(formalRoleColor ? { formalRoleColor } : {}) }, auth.accountId, workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoles.ids,
      qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees)));
  });
  router.get("/roster/calendar", async (request, response) => {
    const query = rangeSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    response.json(await roster.calendar(query.storeId, query.from, query.to));
  });
  router.get("/roster/roles", async (request, response) => {
    const query = roleListSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    const includeInactive = query.includeInactive === "true";
    if (includeInactive) requireAdmin(auth);
    response.json(await roster.listRoles(query.storeId, includeInactive));
  });
  router.get("/roster/roles/draft-usage", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.listDraftRoleUsage(storeId));
  });
  router.post("/roster/roles", async (request, response) => {
    const payload = roleCreateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const jobs = await currentStoreJobs(evaluate, payload.storeId, request.header("cookie")!);
    const job = jobs.find((item) => item.isActive && item.code === payload.code && item.name === payload.nameZh);
    if (!job) {
      throw new HttpError(422, "岗位必须与 Evaluate 当前门店的正式岗位清单一致");
    }
    const roles = await roster.listRoles(payload.storeId);
    if (matchFormalRoles(jobs, roles, payload.storeId).jobRoleIds[job.id]) {
      throw new HttpError(409, "该正式岗位已有排班岗位关联，请使用现有关联以保留历史草稿");
    }
    await validateRequiredSkillCodes(evaluate, payload.requiredSkillCodes, request.header("cookie")!);
    response.status(201).json(await roster.createRole({ ...payload, colorToken: evaluateJobColor(job.colorToken) ?? "#334155" }, jobs));
  });
  router.patch("/roster/roles/:roleId", async (request, response) => {
    const payload = roleUpdateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    if (payload.isActive) {
      const [jobs, roles] = await Promise.all([currentStoreJobs(evaluate, payload.storeId, request.header("cookie")!), roster.listRoles(payload.storeId, true)]);
      const role = roles.find((item) => item.id === request.params.roleId && item.storeId === payload.storeId);
      if (role) {
        const association = assertRoleAssociationUnchanged(jobs, roles, payload.storeId, role.id, payload.nameZh);
        if (association === "INVALID") {
          throw new HttpError(422, "岗位必须匹配 Evaluate 当前门店的正式岗位名称和唯一排班岗位");
        }
        if (association === "TAKEN") {
          throw new HttpError(409, "该正式岗位已有排班岗位关联，请使用现有关联以保留历史草稿");
        }
      }
      await validateRequiredSkillCodes(evaluate, payload.requiredSkillCodes, request.header("cookie")!);
      const formal = matchFormalRoles(jobs, roles, payload.storeId);
      const activatingJob = role && jobs.find((job) => job.isActive && job.code === role.code && job.name === payload.nameZh);
      response.json(await roster.updateRole(request.params.roleId, { ...payload,
        colorToken: evaluateJobColor(activatingJob?.colorToken) ?? formal.colors[request.params.roleId] ?? role?.colorToken ?? "#334155" }, jobs));
      return;
    }
    const currentRole = (await roster.listRoles(payload.storeId, true)).find((role) => role.id === request.params.roleId && role.storeId === payload.storeId);
    response.json(await roster.updateRole(request.params.roleId, { ...payload, colorToken: currentRole?.colorToken ?? "#334155" }));
  });
  router.get("/roster/templates", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.listShiftTemplates(storeId));
  });
  router.post("/roster/templates", async (request, response) => {
    const payload = templateCreateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    if (payload.shiftRoleId) await assertFormalShiftRole(evaluate, roster, payload.storeId, payload.shiftRoleId, request.header("cookie")!);
    response.status(201).json(await roster.createShiftTemplate(payload));
  });
  router.patch("/roster/templates/:templateId", async (request, response) => {
    const payload = templateUpdateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    if (payload.isActive && payload.shiftRoleId) await assertFormalShiftRole(evaluate, roster, payload.storeId, payload.shiftRoleId, request.header("cookie")!);
    response.json(await roster.updateShiftTemplate(request.params.templateId, payload));
  });
  router.get("/roster/availability-templates", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.listAvailabilityTemplates(storeId));
  });
  router.post("/roster/availability-templates", async (request, response) => {
    const payload = availabilityTemplateCreateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    response.status(201).json(await roster.createAvailabilityTemplate(payload));
  });
  router.patch("/roster/availability-templates/:templateId", async (request, response) => {
    const payload = availabilityTemplateUpdateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    response.json(await roster.updateAvailabilityTemplate(request.params.templateId, payload));
  });
  router.get("/roster/settings", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json({ settings: await roster.getSettings(storeId) });
  });
  router.put("/roster/settings/:storeId", async (request, response) => {
    const payload = settingsSchema.parse(request.body); const auth = getAuth(request);
    if (payload.storeId !== request.params.storeId) throw new HttpError(400, "请求门店不一致");
    requireStore(auth, payload.storeId);
    response.json(await roster.saveSettings(payload));
  });
  router.get("/roster/availability", async (request, response) => {
    const query = availabilityQuerySchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    response.json(await roster.listAvailability(query.storeId, query.from, query.to, query.employeeId));
  });
  router.get("/roster/availability-script/shortcuts", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json({ configuration: await roster.getPresetShortcuts(storeId) });
  });
  router.put("/roster/availability-script/shortcuts", async (request, response) => {
    const payload = presetShortcutSaveSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    response.json(await roster.savePresetShortcuts({ ...payload, actorAccountId: auth.accountId }));
  });
  router.post("/roster/availability-script/preview", async (request, response) => {
    const payload = presetScriptPreviewSchema.parse(request.body);
    const auth = getAuth(request); requireStore(auth, payload.storeId);
    const [settings, workforce, configuration] = await Promise.all([
      roster.getSettings(payload.storeId),
      workforceEmployees(evaluate, payload.storeId, request.header("cookie")!),
      roster.getPresetShortcuts(payload.storeId),
    ]);
    if (!configuration) throw new HttpError(409, "请先保存当前门店的脚本快捷码");
    if (payload.expectedShortcutsVersion !== undefined && payload.expectedShortcutsVersion !== configuration.version) {
      throw new SchedulingError(409, { code: "STALE_VERSION", message: "门店快捷码已变化，请核对并重新预览" });
    }
    if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再导入可用时间脚本");
    const timezone = settings.timezone;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const parsed = parsePresetTimeSlotScript({ ...payload, shortcuts: configuration.shortcuts, employees: workforce.employees, timezone, today });
    const end = new Date(`${parsed.weekStart}T00:00:00.000Z`);
    // Include the following day, as the commit does, for overnight Shift coverage.
    end.setUTCDate(end.getUTCDate() + 7);
    const previous = new Date(`${parsed.weekStart}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const existing = parsed.slots.length ? await roster.listAvailability(payload.storeId, previous.toISOString().slice(0, 10), end.toISOString().slice(0, 10)) : [];
    const availabilityPreview = previewPresetTimeSlots(parsed.slots, existing);
    const assignments = availabilityPreview.summary.create
      ? await roster.listAssignedShiftsForPresetPreview(payload.storeId,
        availabilityPreview.slots.filter((slot) => slot.status === "CREATE")) : [];
    const preview = previewPresetTimeSlots(parsed.slots, existing, assignments);
    const sourceHash = presetTimeSlotFingerprint(payload.storeId, parsed.weekStart, timezone, parsed.slots);
    const slotStatusHash = presetTimeSlotReviewFingerprint(preview.slots);
    response.json({ weekStart: parsed.weekStart, timezone, slots: preview.slots,
      issues: [...parsed.issues.filter((issue) => issue.code !== "DUPLICATE_DAY" ||
        !preview.issues.some((previewIssue) => previewIssue.code === "DUPLICATE_DAY")),
      ...preview.issues], summary: preview.summary,
      slotStatusHash,
      previewHash: presetTimeSlotPreviewFingerprint(sourceHash, workforce.workforceRevision, parsed.slots,
        settings?.version ?? null, configuration.version, preview.summary.create, preview.summary.unchanged, slotStatusHash),
      canCommit: parsed.issues.length === 0 && preview.issues.length === 0 && preview.summary.create > 0 });
  });
  router.post("/roster/availability-script/commit", async (request, response) => {
    const payload = presetScriptCommitSchema.parse(request.body);
    const auth = getAuth(request); requireStore(auth, payload.storeId);
    const [settings, workforce, configuration] = await Promise.all([
      roster.getSettings(payload.storeId),
      workforceEmployees(evaluate, payload.storeId, request.header("cookie")!),
      roster.getPresetShortcuts(payload.storeId),
    ]);
    if (!configuration) throw new HttpError(409, "请先保存当前门店的脚本快捷码");
    if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再导入可用时间脚本");
    const timezone = settings.timezone;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const parsed = parsePresetTimeSlotScript({ ...payload, shortcuts: configuration.shortcuts, employees: workforce.employees, timezone, today });
    if (parsed.issues.length) throw new SchedulingError(422, { code: "INVALID_AVAILABILITY_RANGE", message: `脚本存在 ${parsed.issues.length} 项错误，请重新预览` });
    const sourceHash = presetTimeSlotFingerprint(payload.storeId, parsed.weekStart, timezone, parsed.slots);
    const previewHash = presetTimeSlotPreviewFingerprint(sourceHash, workforce.workforceRevision, parsed.slots,
      settings?.version ?? null, configuration.version, payload.expectedCreateCount, payload.expectedUnchangedCount,
      payload.expectedSlotStatusHash);
    if (payload.previewHash !== previewHash) throw new SchedulingError(409, { code: "STALE_VERSION", message: "脚本、员工、目标周或门店配置已变化，请重新预览" });
    response.json(await roster.commitPresetTimeSlots({ storeId: payload.storeId, actorAccountId: auth.accountId,
      sourceHash, weekStart: parsed.weekStart, slots: parsed.slots,
      expectedShortcutsVersion: configuration.version, expectedSettingsVersion: settings?.version ?? null,
      expectedCreateCount: payload.expectedCreateCount, expectedUnchangedCount: payload.expectedUnchangedCount,
      expectedSlotStatusHash: payload.expectedSlotStatusHash }));
  });
  router.put("/roster/availability", async (request, response) => {
    const payload = availabilitySchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    await currentAssignmentSnapshots(evaluate, payload.storeId, [payload.employeeId], request.header("cookie")!);
    response.json(await roster.replaceAvailability(payload));
  });
  router.post("/roster/shifts", async (request, response) => {
    const payload = shiftCreateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const { assignments, formal, qualified } = await currentAssignmentQualifications(evaluate, roster, payload.storeId, payload.employeeIds, request.header("cookie")!);
    const formalRoleName = formal.names[payload.shiftRoleId];
    if (!formalRoleName) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", message: "班次岗位不在 Evaluate 当前门店的正式岗位清单中" });
    assertQualifiedAssignments(payload.shiftRoleId, assignments, qualified, payload.storeId);
    const { employeeIds: _employeeIds, ...shift } = payload;
    void _employeeIds;
    response.status(201).json(await roster.createShift({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId));
  });
  router.post("/roster/shifts/with-period", async (request, response) => {
    const payload = shiftCreateWithPeriodSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const replay = await roster.replayShiftWithPeriod(payload, auth.accountId);
    if (replay) { response.status(200).json(replay); return; }
    const { assignments, formal, qualified } = await currentAssignmentQualifications(evaluate, roster, payload.storeId, payload.employeeIds, request.header("cookie")!);
    const formalRoleName = formal.names[payload.shiftRoleId];
    if (!formalRoleName) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", message: "班次岗位不在 Evaluate 当前门店的正式岗位清单中" });
    assertQualifiedAssignments(payload.shiftRoleId, assignments, qualified, payload.storeId);
    const { employeeIds: _employeeIds, ...shift } = payload;
    void _employeeIds;
    response.status(201).json(await roster.createShiftWithPeriod({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId));
  });
  router.post("/roster/shifts/draft-commit", async (request, response) => {
    const payload = draftCommitSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const incoming = payload.changes.filter((change) => change.kind !== "delete");
    if (!incoming.length) {
      response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId,
        payload.changes.filter((change) => change.kind === "delete"), auth.accountId));
      return;
    }
    const employeeIds = [...new Set(incoming.flatMap((change) => change.value.employeeIds))];
    const { assignments: snapshots, formal, qualified } = await currentAssignmentQualifications(evaluate, roster, payload.storeId, employeeIds, cookie);
    const snapshotsById = new Map(snapshots.map((assignment) => [assignment.employeeId, assignment]));
    const roleNames = new Map<string, string>();
    for (const roleId of new Set(incoming.map((change) => change.value.shiftRoleId))) {
      const name = formal.names[roleId];
      if (!name) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", message: "班次岗位不在 Evaluate 当前门店的正式岗位清单中" });
      roleNames.set(roleId, name);
    }
    const changes: DraftCommitChange[] = payload.changes.map((change) => {
      if (change.kind === "delete") return change;
      const { employeeIds: requestedIds, ...value } = change.value;
      const assignments = requestedIds.map((id) => snapshotsById.get(id));
      if (assignments.some((assignment) => !assignment)) throw new HttpError(422, "部分员工已不属于当前门店，请刷新后重试");
      assertQualifiedAssignments(value.shiftRoleId, assignments as AssignmentSnapshot[], qualified, payload.storeId);
      return { ...change, value: { ...value, assignments: assignments as AssignmentSnapshot[], formalRoleName: roleNames.get(value.shiftRoleId), formalRoleColor: formal.colors[value.shiftRoleId] } };
    });
    response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId, changes, auth.accountId));
  });
  router.get("/roster/shifts/:shiftId", async (request, response) => {
    const storeId = storeIdSchema.parse(request.query.storeId); const auth = getAuth(request); requireStore(auth, storeId);
    response.json(await roster.getShift(storeId, request.params.shiftId));
  });
  router.patch("/roster/shifts/:shiftId", async (request, response) => {
    const payload = shiftUpdateSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const { assignments, formal, qualified } = await currentAssignmentQualifications(evaluate, roster, payload.storeId, payload.employeeIds, request.header("cookie")!);
    const formalRoleName = formal.names[payload.shiftRoleId];
    if (!formalRoleName) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", message: "班次岗位不在 Evaluate 当前门店的正式岗位清单中" });
    assertQualifiedAssignments(payload.shiftRoleId, assignments, qualified, payload.storeId);
    const { employeeIds: _employeeIds, ...shift } = payload;
    void _employeeIds;
    response.json(await roster.updateShift(request.params.shiftId, { ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId));
  });
  router.patch("/roster/shifts/:shiftId/reposition", async (request, response) => {
    const payload = shiftRepositionSchema.parse(request.body); const auth = getAuth(request); requireStore(auth, payload.storeId);
    const cookie = request.header("cookie")!;
    const [workforce, formalRoles] = await Promise.all([workforceEmployees(evaluate, payload.storeId, cookie), currentFormalRoles(evaluate, roster, payload.storeId, cookie)]);
    const activeEmployees = workforce.employees.filter((employee) => employee.isActive);
    const target = payload.targetEmployeeId ? activeEmployees.find((employee) => employee.id === payload.targetEmployeeId) : undefined;
    if (payload.targetEmployeeId && !target) throw new SchedulingError(400, { code: "ARCHIVED_EMPLOYEE", employeeId: payload.targetEmployeeId, storeId: payload.storeId, message: "目标员工已归档或不属于当前门店，不能排班" });
    response.json(await roster.repositionShift(request.params.shiftId, payload, auth.accountId, activeEmployees.map((employee) => employee.id),
      target ? { sourceEmployeeId: payload.sourceEmployeeId!, target: toAssignmentSnapshot(target) } : undefined, formalRoles.names,
      qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors));
  });
  router.delete("/roster/shifts/:shiftId", async (request, response) => {
    const query = shiftDeleteSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    await roster.deleteShift(request.params.shiftId, query.storeId, query.version);
    response.status(204).end();
  });

  router.get("/roster/export.csv", async (request, response) => {
    const query = exportSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    if (query.audience === "manager") requireAdmin(auth);
    const [result, settings] = await Promise.all([
      query.publicationId ? roster.exportPublication(query.storeId, query.publicationId) : roster.exportPeriod(query.storeId, query.periodId!),
      query.publicationId ? Promise.resolve(null) : roster.getSettings(query.storeId),
    ]);
    const snapshotTimezone = "timezone" in result && typeof result.timezone === "string" ? result.timezone : null;
    const legacyTimezone = Boolean(query.publicationId && !snapshotTimezone);
    if (!query.publicationId && !settings) throw new HttpError(409, "请先在设置中保存门店时区，再导出当前排班");
    const timezone = query.publicationId ? snapshotTimezone ?? "UTC" : settings!.timezone;
    response.setHeader("content-type", "text/csv; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="roster-${result.period.startDate}-${query.audience}.csv"`);
    response.send(`\uFEFF${rosterCsv(result.shifts, query.audience, timezone, legacyTimezone)}`);
  });
  router.get("/roster/print", async (request, response) => {
    const query = exportSchema.parse(request.query); const auth = getAuth(request); requireStore(auth, query.storeId);
    if (query.audience === "manager") requireAdmin(auth);
    const [result, settings] = await Promise.all([
      query.publicationId ? roster.exportPublication(query.storeId, query.publicationId) : roster.exportPeriod(query.storeId, query.periodId!),
      query.publicationId ? Promise.resolve(null) : roster.getSettings(query.storeId),
    ]);
    const snapshotTimezone = "timezone" in result && typeof result.timezone === "string" ? result.timezone : null;
    const legacyTimezone = Boolean(query.publicationId && !snapshotTimezone);
    if (!query.publicationId && !settings) throw new HttpError(409, "请先在设置中保存门店时区，再导出当前排班");
    const timezone = query.publicationId ? snapshotTimezone ?? "UTC" : settings!.timezone;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.send(rosterPrint(result.period, result.shifts, query.audience, timezone, legacyTimezone));
  });

  return router;
}

async function integrationBody(evaluate: EvaluateClient, path: string, cookie: string) {
  const upstream = await evaluate.integration(path, cookie);
  const body = await readJson<Record<string, unknown> & { message?: string; contractVersion?: string }>(upstream);
  if (!upstream.ok) throw new HttpError(upstream.status || 503, body?.message ?? "员工数据暂时无法加载");
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.contractVersion !== "string"
    || !/^1\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(body.contractVersion)) throw new HttpError(503, "员工数据契约版本不兼容");
  if (!isoDateTime.safeParse(body.generatedAt).success) throw new HttpError(503, "Evaluate 数据时间戳格式不正确");
  return body;
}

function parseEvaluatePayload<Schema extends z.ZodType>(schema: Schema, value: unknown, name: string): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(503, `Evaluate ${name}格式不正确`);
  return parsed.data;
}

async function currentStoreJobs(evaluate: EvaluateClient, storeId: string, cookie: string) {
  const upstream = await evaluate.storeJobs(storeId, cookie);
  const body = await readJson<unknown>(upstream);
  if (!upstream.ok) throw new HttpError(upstream.status || 503, "Evaluate 岗位清单暂时无法加载");
  const parsed = storeJobsSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(503, "Evaluate Molly 岗位清单格式不正确");
  const jobs = parsed.data;
  if (jobs.some((job) => job.storeId !== storeId)) throw new HttpError(503, "Evaluate 岗位门店不一致");
  return jobs;
}

async function currentFormalRoles(evaluate: EvaluateClient, roster: RosterService, storeId: string, cookie: string) {
  const [jobs, roles] = await Promise.all([currentStoreJobs(evaluate, storeId, cookie), roster.listRoles(storeId)]);
  return matchFormalRoles(jobs, roles, storeId);
}

async function assertFormalShiftRole(evaluate: EvaluateClient, roster: RosterService, storeId: string, roleId: string, cookie: string) {
  const [jobs, roles] = await Promise.all([currentStoreJobs(evaluate, storeId, cookie), roster.listRoles(storeId)]);
  const formal = matchFormalRoles(jobs, roles, storeId);
  const name = formal.names[roleId];
  if (!name) {
    throw new HttpError(422, "班次岗位不在 Evaluate 当前门店的正式岗位清单中");
  }
  return name;
}

async function validateRequiredSkillCodes(evaluate: EvaluateClient, codes: string[], cookie: string) {
  if (!codes.length) return;
  const catalog = skillCatalogEnvelopeSchema.safeParse(await integrationBody(evaluate, "/skill-definitions", cookie));
  if (!catalog.success) throw new HttpError(503, "Evaluate 技能目录暂时不可用，请稍后重试");
  const valid = new Set(catalog.data.skills.map((skill) => skill.code));
  const invalid = [...new Set(codes.filter((code) => !valid.has(code)))];
  if (invalid.length) throw new HttpError(400, `未知或已停用的 Evaluate 技能代码：${invalid.join(", ")}`);
}

async function workforceEmployees(evaluate: EvaluateClient, storeId: string, cookie: string) {
  const employees: z.infer<typeof externalEmployeeSchema>[] = [];
  let first: z.infer<typeof employeeEnvelopeSchema> | null = null;
  const seen = new Set<string>();
  for (let page = 1; page <= 100; page += 1) {
    const path = `/stores/${encodeURIComponent(storeId)}/employees?page=${page}&pageSize=100`;
    const current = parseEvaluatePayload(employeeEnvelopeSchema, await integrationBody(evaluate, path, cookie), "员工列表");
    if (!first) first = current;
    const requiresRevision = Number(first.contractVersion.split(".")[1]) >= 4;
    if (requiresRevision && (!current.pagination || !first.workforceRevision || current.workforceRevision !== first.workforceRevision)) {
      throw new HttpError(503, "Evaluate employee list changed during pagination; refresh and retry.");
    }
    if (current.contractVersion !== first.contractVersion || Boolean(current.pagination) !== Boolean(first.pagination) || (current.pagination && (current.pagination.page !== page || current.pagination.pageSize !== 100))) {
      throw new HttpError(503, "员工列表分页状态已变化，请刷新后重试");
    }
    if (current.pagination && first.pagination && current.pagination.total !== first.pagination.total) {
      throw new HttpError(503, "员工列表在读取期间发生变化，请刷新后重试");
    }
    for (const employee of current.employees) {
      if (employee.storeId !== storeId) throw new HttpError(503, "Evaluate 员工门店范围不一致，请刷新后重试");
      if (seen.has(employee.id)) throw new HttpError(503, "员工列表在读取期间发生变化，请刷新后重试");
      seen.add(employee.id);
      employees.push(employee);
    }
    if (!current.pagination?.hasMore) {
      if (current.pagination && employees.length !== current.pagination.total) {
        throw new HttpError(503, "员工列表不完整，请刷新后重试");
      }
      if (requiresRevision) {
        const verification = parseEvaluatePayload(employeeEnvelopeSchema, await integrationBody(evaluate, `/stores/${encodeURIComponent(storeId)}/employees?page=1&pageSize=1`, cookie), "员工列表");
        const expectedTotal = first.pagination?.total;
        if (verification.contractVersion !== first.contractVersion
          || verification.workforceRevision !== first.workforceRevision
          || expectedTotal === undefined
          || verification.pagination?.page !== 1
          || verification.pagination?.pageSize !== 1
          || verification.pagination?.total !== expectedTotal
          || verification.pagination?.hasMore !== (expectedTotal > 1)
          || verification.employees.length !== Math.min(expectedTotal, 1)
          || verification.employees.some((employee) => employee.storeId !== storeId)) {
          throw new HttpError(503, "Evaluate employee list changed during pagination; refresh and retry.");
        }
      }
      return { contractVersion: first.contractVersion, generatedAt: first.generatedAt,
        workforceRevision: first.workforceRevision ?? null, employees };
    }
  }
  throw new HttpError(503, "员工列表超过当前分页上限，请联系管理员");
}

async function currentAssignmentSnapshots(evaluate: EvaluateClient, storeId: string, employeeIds: string[], cookie: string) {
  const workforce = await workforceEmployees(evaluate, storeId, cookie);
  const employeeById = new Map(workforce.employees.map((employee) => [employee.id, employee]));
  const employees = employeeIds.map((employeeId) => employeeById.get(employeeId));
  const invalidIndex = employees.findIndex((employee) => !employee?.isActive);
  if (invalidIndex >= 0) throw new SchedulingError(400, { code: "ARCHIVED_EMPLOYEE", employeeId: employeeIds[invalidIndex], employeeName: employees[invalidIndex]?.displayName, storeId, message: `${employees[invalidIndex]?.displayName ?? "所选员工"} 已归档或不属于当前门店，不能排班` });
  return employees.map((employee) => toAssignmentSnapshot(employee!));
}

async function currentAssignmentQualifications(evaluate: EvaluateClient, roster: RosterService, storeId: string, employeeIds: string[], cookie: string) {
  const [workforce, formal] = await Promise.all([
    workforceEmployees(evaluate, storeId, cookie), currentFormalRoles(evaluate, roster, storeId, cookie),
  ]);
  const byId = new Map(workforce.employees.map((employee) => [employee.id, employee]));
  const employees = employeeIds.map((id) => byId.get(id));
  const invalid = employees.findIndex((employee) => !employee?.isActive);
  if (invalid >= 0) throw new SchedulingError(400, { code: "ARCHIVED_EMPLOYEE", employeeId: employeeIds[invalid], storeId,
    message: `${employees[invalid]?.displayName ?? "所选员工"} 已归档或不属于当前门店，不能排班` });
  return { assignments: employees.map((employee) => toAssignmentSnapshot(employee!)), formal,
    qualified: qualifiedEmployeeIdsByRole(formal.jobRoleIds, workforce.employees) };
}

function assertQualifiedAssignments(roleId: string, assignments: AssignmentSnapshot[], qualified: Record<string, string[]>, storeId: string) {
  const allowed = new Set(qualified[roleId] ?? []);
  const invalid = assignments.find((assignment) => !allowed.has(assignment.employeeId));
  if (invalid) throw new SchedulingError(422, { code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: invalid.employeeId,
    employeeName: invalid.employeeNameSnapshot, storeId,
    message: `${invalid.employeeNameSnapshot} 尚未获得该正式岗位授权，请先在 Evaluate 单独确认员工岗位` });
}

function toAssignmentSnapshot(current: z.infer<typeof externalEmployeeSchema>): AssignmentSnapshot {
  return {
    employeeId: current.id,
    employeeNameSnapshot: current.displayName,
    employeeTypeSnapshot: current.employeeType,
    employmentTypeSnapshot: current.employmentType,
    officialScoreSnapshot: current.officialScore?.score ?? null,
    tierSnapshot: current.officialScore?.tier ?? null,
    officialScoreRoundId: current.officialScore?.roundId ?? null,
    officialScoreClosedAt: current.officialScore?.closedAt ?? null,
  };
}

async function currentStoreSnapshot(evaluate: EvaluateClient, storeId: string, cookie: string) {
  const stores = parseEvaluatePayload(storeEnvelopeSchema, await integrationBody(evaluate, "/stores", cookie), "门店清单");
  const store = stores.stores.find((item) => item.id === storeId);
  if (!store || !store.isActive) throw new HttpError(404, "未找到有效门店");
  return { id: store.id, name: store.name };
}

type ExportShift = { date: string; startAt: string; endAt: string; breakMinutes: number; roleNameSnapshot: string; publicNote: string | null; internalNote: string | null; assignments: Array<{ employeeNameSnapshot: string; officialScoreSnapshot: unknown; tierSnapshot: string | null }> };
function rosterCsv(shifts: ExportShift[], audience: "employee" | "manager", timezone: string, legacyTimezone = false) {
  const headers = ["日期", "开始", "结束", "休息分钟", "岗位", "员工", "公开备注", ...(audience === "manager" ? ["内部备注", "评分快照", "Tier快照"] : [])];
  headers.push("Paid Hours");
  if (legacyTimezone) headers.push("时区说明（UTC；原门店时区未知）");
  const rows = shifts.flatMap((shift) => {
    const clocks = shiftTimesForExport(shift, timezone, legacyTimezone);
    return shift.assignments.map((assignment) => [legacyTimezone ? dateForExport(shift.startAt, timezone) : shift.date, clocks.start, clocks.end, String(shift.breakMinutes), shift.roleNameSnapshot, assignment.employeeNameSnapshot, shift.publicNote ?? "", ...(audience === "manager" ? [shift.internalNote ?? "", assignment.officialScoreSnapshot == null ? "" : String(assignment.officialScoreSnapshot), assignment.tierSnapshot ?? ""] : []), hours(paidMinutes(shift.startAt,shift.endAt,shift.breakMinutes)).toFixed(4), ...(legacyTimezone ? ["UTC；原门店时区未知"] : [])]);
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
function rosterPrint(period: { startDate: string; endDate: string; status: string }, shifts: ExportShift[], audience: "employee" | "manager", timezone: string, legacyTimezone = false) {
  const rows = shifts.flatMap((shift) => {
    const clocks = shiftTimesForExport(shift, timezone, legacyTimezone);
    return shift.assignments.map((assignment) => `<tr><td>${html(legacyTimezone ? dateForExport(shift.startAt, timezone) : shift.date)}</td><td>${html(clocks.start)}–${html(clocks.end)}${legacyTimezone ? " UTC" : ""}</td><td>${html(shift.roleNameSnapshot)}</td><td>${html(assignment.employeeNameSnapshot)}</td><td>${html(shift.publicNote ?? "")}</td>${audience === "manager" ? `<td>${html(shift.internalNote ?? "")}</td><td>${html(assignment.officialScoreSnapshot == null ? "" : String(assignment.officialScoreSnapshot))} ${html(assignment.tierSnapshot ?? "")}</td>` : ""}</tr>`);
  }).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>排班 ${html(period.startDate)} 至 ${html(period.endDate)}</title><style>body{font:14px/1.5 Arial,sans-serif;color:#171717;margin:32px}h1{font-size:24px}p{color:#666}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}@media print{body{margin:12mm}}</style></head><body><h1>门店排班</h1><p>${html(period.startDate)} 至 ${html(period.endDate)} · ${period.status === "PUBLISHED" ? "已发布" : "草稿"}</p>${legacyTimezone ? '<p role="status">旧发布记录的原门店时区未知；以下班次日期和时间均按 UTC 显示。</p>' : ""}<table><thead><tr><th>日期</th><th>时间</th><th>岗位</th><th>员工</th><th>公开备注</th>${audience === "manager" ? "<th>内部备注</th><th>评分快照</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
function timeForExport(value: string, timezone: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(value)); }
function shiftTimesForExport(shift: ExportShift, timezone: string, legacyTimezone: boolean) {
  const startOffset = offsetForExport(shift.startAt, timezone);
  const endOffset = offsetForExport(shift.endAt, timezone);
  const labelOffsets = startOffset !== endOffset;
  return {
    start: `${timeForExport(shift.startAt, timezone)}${labelOffsets ? ` ${startOffset}` : ""}`,
    end: `${endTimeForExport(shift, timezone, legacyTimezone)}${labelOffsets ? ` ${endOffset}` : ""}`,
  };
}
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetForExport(value: string, timezone: string) {
  let formatter = offsetFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" });
    offsetFormatters.set(timezone, formatter);
  }
  const offset = formatter.formatToParts(new Date(value)).find((part) => part.type === "timeZoneName")?.value;
  return (offset ?? "GMT").replace(/^GMT/, "UTC");
}
function dateForExport(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function endTimeForExport(shift: ExportShift, timezone: string, legacyTimezone = false) {
  const startDate = legacyTimezone ? dateForExport(shift.startAt, timezone) : shift.date;
  const endDate = dateForExport(shift.endAt, timezone);
  return `${timeForExport(shift.endAt, timezone)}${endDate !== startDate ? ` (${endDate} 次日)` : ""}`;
}
function csvCell(value: string) {
  // Spreadsheet importers can ignore leading whitespace and may recognize
  // full-width operators. Keep the existing text prefix for every suspect cell.
  const unsafe = /^[\t\r\n]/.test(value) || /^[\s\u200B-\u200D\u2060\uFEFF]*[=+\-@＝＋－＠]/u.test(value);
  const safe = unsafe ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function html(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
