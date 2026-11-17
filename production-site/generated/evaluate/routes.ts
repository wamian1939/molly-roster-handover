import { Router, type ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";
import { prisma } from "./prisma.js";
import { EvaluationCatalogService } from "./evaluationCatalogService.js";
import { EvaluationReadService } from "./evaluationReadService.js";
import { EmployeeService } from "./employeeService.js";
import { PerformanceNoteService } from "./performanceNoteService.js";
import { StoreService } from "./storeService.js";
import { EvaluationV1Service } from "./evaluationV1Service.js";
import { EmployeeEvaluationSummaryService } from "./employeeEvaluationSummaryService.js";
import { AnalyticsV1Service } from "./analyticsV1Service.js";
import { RosterSkillBoardService } from "./rosterSkillBoardService.js";
import { AccountService } from "./accountService.js";
import { EvaluationRoundService } from "./evaluationRoundService.js";
import { RosterIntegrationService } from "./rosterIntegrationService.js";
import { StoreJobService } from "./storeJobService.js";
import { CurrentSkillService } from "./currentSkillService.js";
import { LoginRateLimitService } from "./loginRateLimitService.js";
import { describeErrorForLog } from "./safeLogging.js";
import {
  AuthService,
  clearSessionCookie,
  createRequireAuth,
  getAccessibleStoreScope,
  getAuthContext,
  readSessionToken,
  requireAdmin,
  requireStoreAccess,
  setSessionCookie,
} from "./auth.js";
import {
  accountCreateSchema,
  accountListQuerySchema,
  analyticsV1QuerySchema,
  accountUpdateSchema,
  employeeListQuerySchema,
  employeeMutationSchema,
  employeeUpdateSchema,
  loginSchema,
  liveEvaluationSubmissionSchema,
  liveSkillPreviewSchema,
  performanceNoteListQuerySchema,
  performanceNoteMutationSchema,
  storeMutationSchema,
  storeUpdateSchema,
  resetPasswordSchema,
  storeEvaluationListQuerySchema,
  storeJobMutationSchema,
  storeJobUpdateSchema,
  evaluationHistoryQuerySchema,
  currentSkillConfirmationSchema,
} from "./validation.js";

export function createEvaluationRouter(
  db: any,
  service = new EvaluationCatalogService(db),
  employeeService = new EmployeeService(db),
  performanceNoteService = new PerformanceNoteService(db),
  storeService = new StoreService(db),
  evaluationV1Service = new EvaluationV1Service(db),
  employeeEvaluationSummaryService = new EmployeeEvaluationSummaryService(db, evaluationV1Service),
  evaluationReadService = new EvaluationReadService(db),
  analyticsV1Service = new AnalyticsV1Service(db),
  rosterSkillBoardService = new RosterSkillBoardService(db),
  authService = new AuthService(db),
  accountService = new AccountService(db),
  evaluationRoundService = new EvaluationRoundService(db),
  rosterIntegrationService = new RosterIntegrationService(db),
  storeJobService = new StoreJobService(db),
  currentSkillService = new CurrentSkillService(db),
  loginRateLimitService = new LoginRateLimitService(db),
) {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.post("/auth/login", async (request, response) => {
    const payload = loginSchema.parse(request.body);
    const ipAddress = request.ip ?? "unknown";
    const retryAfterSeconds = await loginRateLimitService.reserve(ipAddress, payload.username);
    if (retryAfterSeconds > 0) {
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({ message: "登录尝试过于频繁，请稍后再试。" });
      return;
    }
    const result = await authService.login(payload.username, payload.password);
    try {
      await loginRateLimitService.clear(ipAddress, payload.username);
    } catch (error) {
      console.error("Login rate-limit clear failed", describeErrorForLog(error));
    }
    setSessionCookie(response, result.token, result.expiresAt);
    response.json({ user: result.user });
  });

  router.use(createRequireAuth(authService));

  router.get("/auth/me", (request, response) => {
    response.json({ user: getAuthContext(request) });
  });

  router.post("/auth/logout", async (request, response) => {
    await authService.logout(readSessionToken(request));
    clearSessionCookie(response);
    response.json({ ok: true });
  });

  router.get("/evaluations/periods", async (_request, response) => {
    response.json(await service.listPeriods());
  });

  router.get("/stores", async (request, response) => {
    const auth = getAuthContext(request);
    response.json(await service.listStores(getAccessibleStoreScope(auth)));
  });

  router.get("/stores/manage", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const includeArchived = ["1", "true", "yes"].includes(readString(request.query.includeArchived)?.toLowerCase() ?? "");
    response.json(await storeService.listStoresWithCounts(undefined, includeArchived));
  });

  router.get("/admin/accounts", async (request, response) => {
    requireAdmin(getAuthContext(request));
    const query = accountListQuerySchema.parse(request.query);
    response.json(await accountService.listAccounts(query.storeId));
  });

  router.post("/admin/accounts", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = accountCreateSchema.parse(request.body);
    response.status(201).json(await accountService.createAccount(payload, auth.accountId));
  });

  router.patch("/admin/accounts/:accountId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = accountUpdateSchema.parse(request.body);
    response.json(await accountService.updateAccount(request.params.accountId, payload, auth.accountId));
  });

  router.delete("/admin/accounts/:accountId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    response.json(await accountService.deleteAccount(request.params.accountId, auth.accountId));
  });

  router.post("/admin/accounts/:accountId/reset-password", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = resetPasswordSchema.parse(request.body);
    response.json(await accountService.resetPassword(request.params.accountId, payload.password, auth.accountId));
  });

  router.post("/stores", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = storeMutationSchema.parse(request.body);
    response.status(201).json(await storeService.createStore(payload));
  });

  router.put("/stores/:storeId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = storeUpdateSchema.parse(request.body);
    response.json(await storeService.updateStore(request.params.storeId, payload));
  });

  router.post("/stores/:storeId/archive", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    response.json(await storeService.archiveStore(request.params.storeId));
  });

  router.post("/stores/:storeId/reactivate", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    response.json(await storeService.reactivateStore(request.params.storeId));
  });

  router.get("/store-jobs", async (request, response) => {
    const auth = getAuthContext(request);
    const storeId = readString(request.query.storeId);
    if (storeId) requireStoreAccess(auth, storeId);
    const includeInactive = auth.role === "ADMIN" && request.query.includeInactive === "true";
    response.json(await storeJobService.list(getAccessibleStoreScope(auth), storeId, includeInactive));
  });

  router.post("/stores/:storeId/jobs", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    requireStoreAccess(auth, request.params.storeId);
    const payload = storeJobMutationSchema.parse(request.body);
    response.status(201).json(await storeJobService.create(request.params.storeId, payload));
  });

  router.patch("/store-jobs/:jobId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    requireStoreAccess(auth, await storeJobService.getStoreId(request.params.jobId));
    response.json(await storeJobService.update(request.params.jobId, storeJobUpdateSchema.parse(request.body)));
  });

  router.get("/evaluations/dashboard", async (request, response) => {
    const auth = getAuthContext(request);
    const storeId = readString(request.query.storeId);
    if (storeId) requireStoreAccess(auth, storeId);
    response.json(await analyticsV1Service.getDashboard(getAccessibleStoreScope(auth), storeId, auth));
  });

  router.get("/stores/:storeId/evaluations", async (request, response) => {
    const auth = getAuthContext(request);
    requireStoreAccess(auth, request.params.storeId);
    const query = storeEvaluationListQuerySchema.parse(request.query);
    response.json(await evaluationReadService.getStoreRoster(request.params.storeId, query, auth));
  });

  router.get("/employees", async (request, response) => {
    const auth = getAuthContext(request);
    const query = employeeListQuerySchema.parse(request.query);
    if (query.storeId) requireStoreAccess(auth, query.storeId);
    const storeScope = getAccessibleStoreScope(auth);
    response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }));
  });

  router.get("/stores/:storeId/employees", async (request, response) => {
    const auth = getAuthContext(request);
    requireStoreAccess(auth, request.params.storeId);
    const query = employeeListQuerySchema.parse({ ...request.query, storeId: request.params.storeId });
    const storeScope = getAccessibleStoreScope(auth);
    response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }));
  });

  router.get("/employees/:employeeId", async (request, response) => {
    const auth = getAuthContext(request);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    response.json(employee);
  });

  router.get("/employees/:employeeId/profile", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    response.setHeader("Cache-Control", "no-store, private");
    response.json(await employeeService.getEmployeeProfile(request.params.employeeId));
  });

  router.get("/employees/:employeeId/evaluation-summary", async (request, response) => {
    const auth = getAuthContext(request);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    response.json(
      await employeeEvaluationSummaryService.getSummary(
        request.params.employeeId,
        getAccessibleStoreScope(auth),
        auth,
      ),
    );
  });

  router.get("/performance-notes", async (request, response) => {
    const auth = getAuthContext(request);
    const query = performanceNoteListQuerySchema.parse(request.query);
    if (query.storeId) requireStoreAccess(auth, query.storeId);
    const storeScope = getAccessibleStoreScope(auth);
    response.json(
      await performanceNoteService.listPerformanceNotes({
        ...query,
        ...(storeScope ? { accessibleStoreIds: storeScope } : {}),
      }),
    );
  });

  router.get("/employees/:employeeId/performance-notes", async (request, response) => {
    const auth = getAuthContext(request);
    const query = performanceNoteListQuerySchema.parse({ ...request.query, employeeId: request.params.employeeId });
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, query.storeId ?? employee.storeId);
    const storeScope = getAccessibleStoreScope(auth);
    response.json(
      await performanceNoteService.getPerformanceNotesForEmployee(request.params.employeeId, {
        ...query,
        ...(storeScope ? { accessibleStoreIds: storeScope } : {}),
      }),
    );
  });

  router.post("/performance-notes", async (request, response) => {
    const auth = getAuthContext(request);
    const payload = performanceNoteMutationSchema.parse(request.body);
    requireStoreAccess(auth, payload.storeId);
    await storeService.assertActiveStore(payload.storeId);
    response.status(201).json(await performanceNoteService.createPerformanceNote(payload, auth.accountId));
  });

  router.post("/employees", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = employeeMutationSchema.parse(request.body);
    requireStoreAccess(auth, payload.storeId);
    await storeService.assertActiveStore(payload.storeId);
    response.status(201).json(await employeeService.createEmployee(payload, auth.accountId));
  });

  router.get("/employees/:employeeId/current-skills", async (request, response) => {
    const auth = getAuthContext(request);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    response.json({ skills: await currentSkillService.list(employee.id) });
  });

  router.get("/employees/:employeeId/current-skills/:skillDefinitionId/confirmations", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    const page = z.coerce.number().int().min(1).max(100000).parse(request.query.page ?? 1);
    const pageSize = z.coerce.number().int().min(1).max(50).parse(request.query.pageSize ?? 5);
    response.json(await currentSkillService.listConfirmations(employee.id, request.params.skillDefinitionId, page, pageSize));
  });

  router.patch("/employees/:employeeId/current-skills/:skillDefinitionId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    const input = currentSkillConfirmationSchema.parse(request.body);
    response.json({ skills: await currentSkillService.confirm(employee.id, request.params.skillDefinitionId, input.status, input.expectedUpdatedAt, auth.accountId, input.reason) });
  });

  router.put("/employees/:employeeId", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const payload = employeeUpdateSchema.parse(request.body);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    await storeService.assertActiveStore(employee.storeId);
    if (payload.storeId) requireStoreAccess(auth, payload.storeId);
    if (payload.storeId) await storeService.assertActiveStore(payload.storeId);
    response.json(await employeeService.updateEmployee(request.params.employeeId, payload, auth.accountId));
  });

  router.post("/employees/:employeeId/promote-to-regular", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    response.json(await employeeService.promoteToRegular(request.params.employeeId));
  });

  router.post("/employees/:employeeId/archive", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    await storeService.assertActiveStore(employee.storeId);
    response.json(await employeeService.archiveEmployee(request.params.employeeId));
  });

  router.post("/employees/:employeeId/restore", async (request, response) => {
    const auth = getAuthContext(request);
    requireAdmin(auth);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    await storeService.assertActiveStore(employee.storeId);
    response.json(await employeeService.restoreEmployee(request.params.employeeId));
  });

  router.get("/evaluations/history", async (request, response) => {
    const auth = getAuthContext(request);
    const storeId = readString(request.query.storeId);
    if (storeId) requireStoreAccess(auth, storeId);
    response.json(await evaluationReadService.listCompletedHistory(storeId ? [storeId] : getAccessibleStoreScope(auth)));
  });

  router.get("/evaluation-rounds/history", async (request, response) => {
    const auth = getAuthContext(request);
    const query = evaluationHistoryQuerySchema.parse(request.query);
    if (query.storeId) requireStoreAccess(auth, query.storeId);
    response.json(await evaluationReadService.listClosedRoundHistory(query, getAccessibleStoreScope(auth), auth));
  });

  router.get("/evaluations/analytics", async (request, response) => {
    const auth = getAuthContext(request);
    const query = analyticsV1QuerySchema.parse(request.query);
    if (query.storeId) requireStoreAccess(auth, query.storeId);
    response.json(await analyticsV1Service.getAnalytics(
      getAccessibleStoreScope(auth),
      query.storeId,
      query.employeeType,
      auth,
    ));
  });

  router.get("/roster-skill-board", async (request, response) => {
    const auth = getAuthContext(request);
    const storeId = readString(request.query.storeId);
    if (storeId) requireStoreAccess(auth, storeId);
    response.json(await rosterSkillBoardService.getBoard(getAccessibleStoreScope(auth), storeId, auth));
  });

  router.get("/roster-integration/contract-version", (_request, response) => {
    response.json(rosterIntegrationService.contractVersion());
  });

  router.get("/roster-integration/stores", async (request, response) => {
    const auth = getAuthContext(request);
    response.json(await rosterIntegrationService.listStores(getAccessibleStoreScope(auth)));
  });

  router.get("/roster-integration/skill-definitions", async (request, response) => {
    getAuthContext(request);
    response.json(await rosterIntegrationService.listSkillDefinitions());
  });

  router.get("/roster-integration/stores/:storeId/employees", async (request, response) => {
    const auth = getAuthContext(request);
    requireStoreAccess(auth, request.params.storeId);
    const paged = request.query.page !== undefined || request.query.pageSize !== undefined;
    const page = paged ? z.coerce.number().int().min(1).max(100000).parse(request.query.page ?? 1) : undefined;
    const pageSize = paged ? z.coerce.number().int().min(1).max(100).parse(request.query.pageSize ?? 100) : undefined;
    response.json(await rosterIntegrationService.listEmployees(request.params.storeId, getAccessibleStoreScope(auth), page, pageSize));
  });

  router.get("/roster-integration/employees/:employeeId", async (request, response) => {
    const auth = getAuthContext(request);
    const result = await rosterIntegrationService.getEmployee(request.params.employeeId, getAccessibleStoreScope(auth));
    if (!result.employee) {
      response.status(404).json({ message: "未找到员工" });
      return;
    }
    response.json(result);
  });

  router.get("/employees/:employeeId/evaluation-rounds/current", async (request, response) => {
    const auth = getAuthContext(request);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    response.json(await evaluationRoundService.getCurrentRound(employee.id, auth));
  });

  router.post("/employees/:employeeId/scoring-context", async (request, response) => {
    const auth = getAuthContext(request);
    const employee = await employeeService.getEmployee(request.params.employeeId);
    requireStoreAccess(auth, employee.storeId);
    await storeService.assertActiveStore(employee.storeId);
    response.status(200).json(await evaluationV1Service.startLiveScoring(employee.id, auth));
  });

  router.get("/evaluation-rounds/:roundId", async (request, response) => {
    response.json(await evaluationRoundService.getRound(request.params.roundId, getAuthContext(request)));
  });

  router.get("/evaluation-rounds/:roundId/aggregate", async (request, response) => {
    response.json(await evaluationRoundService.getAggregate(request.params.roundId, getAuthContext(request)));
  });

  router.get("/evaluation-rounds/:roundId/evaluations", async (request, response) => {
    response.json(await evaluationRoundService.listEvaluations(request.params.roundId, getAuthContext(request)));
  });

  router.get("/evaluation-rounds/:roundId/my-evaluation", async (request, response) => {
    response.json(await evaluationV1Service.getMyEvaluation(request.params.roundId, getAuthContext(request)));
  });

  router.get("/evaluation-rounds/:roundId/scoring-context", async (request, response) => {
    response.json(await evaluationV1Service.getLiveScoringContext(request.params.roundId, getAuthContext(request)));
  });

  router.post("/evaluation-rounds/:roundId/preview-my-evaluation", async (request, response) => {
    const payload = liveEvaluationSubmissionSchema.parse(request.body);
    response.json(await evaluationV1Service.previewLiveSubmission(request.params.roundId, payload, getAuthContext(request)));
  });

  router.post("/evaluation-rounds/:roundId/preview-my-skills", async (request, response) => {
    const payload = liveSkillPreviewSchema.parse(request.body);
    response.json(await evaluationV1Service.previewLiveSkills(request.params.roundId, payload, getAuthContext(request)));
  });

  router.post("/evaluation-rounds/:roundId/analyze-my-evaluation", async (request, response) => {
    const textFeedback = typeof request.body?.textFeedback === "string" ? request.body.textFeedback : "";
    response.json(await evaluationV1Service.analyzeLiveText(request.params.roundId, textFeedback, getAuthContext(request)));
  });

  router.put("/evaluation-rounds/:roundId/my-evaluation", async (request, response) => {
    const payload = liveEvaluationSubmissionSchema.parse(request.body);
    response.json(await evaluationV1Service.submitLiveEvaluation(request.params.roundId, payload, getAuthContext(request)));
  });

  router.post("/evaluation-rounds/:roundId/close", async (request, response) => {
    response.json(await evaluationRoundService.closeRound(request.params.roundId, getAuthContext(request)));
  });

  router.get("/evaluations/v1/:evaluationId", async (request, response) => {
    const auth = getAuthContext(request);
    const storeId = await evaluationV1Service.getStoreId(request.params.evaluationId);
    if (!storeId) {
      response.status(404).json({ message: "评价不存在。" });
      return;
    }
    requireStoreAccess(auth, storeId);
    response.json(await evaluationV1Service.getEvaluation(request.params.evaluationId, auth));
  });

const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void request;
  void next;

  if (error instanceof ZodError) {
    response.status(400).json({ message: "Validation failed.", issues: error.issues });
    return;
  }

  const maybeHttpError = error as Error & { status?: number };
  const status = maybeHttpError.status ?? 500;
  if (status >= 500) {
    const safeError = describeErrorForLog(error);
    console.error("Unhandled API error", {
      method: request.method,
      path: request.originalUrl,
      ...safeError,
    });
    response.status(500).json({ message: "服务器发生错误，请稍后重试" });
    return;
  }
  response.status(status).json({ message: maybeHttpError.message });
};

  router.use(errorHandler);

  return router;
}



function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
