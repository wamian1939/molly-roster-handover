import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const storeManager = {
  "x-user-id": "manager-1",
  "x-user-role": "StoreManager",
  "x-store-ids": "store-1",
};

function setup() {
  const service = {
    listPeriods: vi.fn(async () => ["2026 Q3"]),
    listStores: vi.fn(async () => []),
    getDashboard: vi.fn(async () => ({ kpis: {} })),
    getAnalytics: vi.fn(async () => ({ storeComparison: [] })),
  };
  const readService = {
    getStoreRoster: vi.fn(async () => ({
      store: { id: "store-1", name: "Hurstville" },
      summary: { totalEmployees: 0, evaluatedEmployees: 0, submittedEmployees: 0, averageScore: null },
      roles: [],
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    })),
    listCompletedHistory: vi.fn(async () => []),
    listClosedRoundHistory: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 })),
  };
  const v1Service = {
    getStoreId: vi.fn(async () => "store-1"),
    getEvaluation: vi.fn(async () => ({ id: "eval-v1" })),
    getMyEvaluation: vi.fn(async () => null),
    startLiveScoring: vi.fn(async () => ({ id: "unsubmitted", roundId: "round-1", status: "Unsubmitted" })),
    getLiveScoringContext: vi.fn(async () => ({ id: "unsubmitted", roundId: "round-1", status: "Unsubmitted" })),
    previewLiveSubmission: vi.fn(async () => ({ overallScore: 80, tier: "T2" })),
    previewLiveSkills: vi.fn(async () => ({ componentScore: 60, skillCategories: {} })),
    analyzeLiveText: vi.fn(async () => ({ textScore: 5 })),
    submitLiveEvaluation: vi.fn(async () => ({ id: "eval-1", status: "Submitted" })),
  };
  const roundService = {
    getRound: vi.fn(async () => ({ id: "round-1" })),
    getAggregate: vi.fn(async () => ({ id: "round-1", evaluators: [] })),
    listEvaluations: vi.fn(async () => []),
    closeRound: vi.fn(async () => ({ id: "round-1", status: "CLOSED" })),
    getCurrentRound: vi.fn(async () => null),
    getOrCreateOpenRound: vi.fn(async () => ({ id: "round-1" })),
  };
  const analyticsV1Service = {
    getDashboard: vi.fn(async () => ({ summary: {} })),
    getAnalytics: vi.fn(async () => ({ summary: {} })),
  };
  const employeeService = { getEmployee: vi.fn(async () => ({ id: "employee-1", storeId: "store-1" })) };
  const storeService = { assertActiveStore: vi.fn(async () => undefined) };
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createEvaluationRouter(
      service as never,
      employeeService as never,
      undefined,
      storeService as never,
      v1Service as never,
      undefined,
      readService as never,
      analyticsV1Service as never,
      undefined,
      undefined,
      undefined,
      roundService as never,
    ),
  );
  return { app, service, readService, v1Service, analyticsV1Service, roundService };
}

describe("evaluation route boundaries", () => {
  it("keeps Period, Dashboard, and Analytics routes intact", async () => {
    const { app, service, analyticsV1Service } = setup();
    await request(app).get("/api/evaluations/periods").expect(200, ["2026 Q3"]);
    await request(app).get("/api/evaluations/dashboard?storeId=store-1").set(storeManager).expect(200);
    await request(app).get("/api/evaluations/analytics?storeId=store-1").set(storeManager).expect(200);
    expect(analyticsV1Service.getDashboard).toHaveBeenCalledWith(["store-1"], "store-1", expect.objectContaining({ accountId: "manager-1" }));
    expect(analyticsV1Service.getAnalytics).toHaveBeenCalledWith(["store-1"], "store-1", undefined, expect.objectContaining({ accountId: "manager-1" }));
    expect(service.getDashboard).not.toHaveBeenCalled();
    expect(service.getAnalytics).not.toHaveBeenCalled();
  });

  it("uses the V1 read service for Store roster filters", async () => {
    const { app, readService } = setup();
    await request(app)
      .get("/api/stores/store-1/evaluations?status=Completed&employeeType=TRAINING&page=2&pageSize=10")
      .set(storeManager)
      .expect(200);
    expect(readService.getStoreRoster).toHaveBeenCalledWith("store-1", {
      status: "Completed",
      employeeType: "TRAINING",
      page: 2,
      pageSize: 10,
    }, expect.objectContaining({ accountId: "manager-1" }));
  });

  it("passes the employee type filter through Analytics without weakening store scope", async () => {
    const { app, analyticsV1Service } = setup();
    await request(app)
      .get("/api/evaluations/analytics?storeId=store-1&employeeType=TRAINING")
      .set(storeManager)
      .expect(200);
    expect(analyticsV1Service.getAnalytics).toHaveBeenCalledWith(["store-1"], "store-1", "TRAINING", expect.objectContaining({ accountId: "manager-1" }));
  });

  it("scopes completed History through the V1 read service", async () => {
    const { app, readService } = setup();
    await request(app).get("/api/evaluations/history").set(storeManager).expect(200, []);
    expect(readService.listCompletedHistory).toHaveBeenCalledWith(["store-1"]);
    await request(app).get("/api/evaluations/history?storeId=store-1").set(storeManager).expect(200, []);
    expect(readService.listCompletedHistory).toHaveBeenLastCalledWith(["store-1"]);
    await request(app).get("/api/evaluations/history?storeId=store-2").set(storeManager).expect(403);
  });

  it("uses the CLOSED Round history contract with server-side filters and scope", async () => {
    const { app, readService } = setup();
    await request(app).get("/api/evaluation-rounds/history?storeId=store-1&employeeType=REGULAR&tier=T2&page=2&pageSize=10").set(storeManager).expect(200);
    expect(readService.listClosedRoundHistory).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store-1", employeeType: "REGULAR", tier: "T2", page: 2, pageSize: 10 }), ["store-1"], expect.objectContaining({ role: "STORE_EVALUATOR", storeIds: ["store-1"] }));
    await request(app).get("/api/evaluation-rounds/history?storeId=store-2").set(storeManager).expect(403);
  });

  it("rejects cross-store Store roster reads", async () => {
    const { app, readService } = setup();
    await request(app).get("/api/stores/store-2/evaluations").set(storeManager).expect(403);
    expect(readService.getStoreRoster).not.toHaveBeenCalled();
  });

  it("allows every explicitly assigned Store while keeping unassigned Stores forbidden", async () => {
    const { app, readService, analyticsV1Service } = setup();
    const multiStoreManager = { ...storeManager, "x-store-ids": "store-1,store-2" };
    await request(app).get("/api/stores/store-2/evaluations").set(multiStoreManager).expect(200);
    await request(app).get("/api/evaluations/dashboard").set(multiStoreManager).expect(200);
    await request(app).get("/api/stores/store-3/evaluations").set(multiStoreManager).expect(403);
    expect(readService.getStoreRoster).toHaveBeenCalledWith("store-2", expect.any(Object), expect.objectContaining({ storeIds: ["store-1", "store-2"] }));
    expect(analyticsV1Service.getDashboard).toHaveBeenCalledWith(["store-1", "store-2"], undefined, expect.objectContaining({ accountId: "manager-1" }));
  });

  it.each(["/api/evaluations/dashboard?storeId=store-2", "/api/evaluations/analytics?storeId=store-2"])(
    "rejects cross-store analytics scope for %s",
    async (path) => {
      const { app, analyticsV1Service } = setup();
      await request(app).get(path).set(storeManager).expect(403);
      expect(analyticsV1Service.getDashboard).not.toHaveBeenCalled();
      expect(analyticsV1Service.getAnalytics).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["get", "/api/evaluations/form?employeeId=employee-1&storeId=store-1"],
    ["post", "/api/evaluations/draft"],
    ["post", "/api/evaluations/eval-legacy/complete"],
    ["post", "/api/evaluations/analyze-text"],
    ["get", "/api/employees/employee-1/evaluations/history"],
    ["get", "/api/employees/employee-1/ai-analysis-runs"],
  ] as const)("does not expose legacy %s %s", async (method, path) => {
    const { app } = setup();
    await request(app)[method](path).set(storeManager).expect(404);
  });

  it("removes the legacy save route and opens a live scoring context without creating an evaluation", async () => {
    const { app, v1Service } = setup();
    await request(app).post("/api/evaluations/v1/drafts").set(storeManager).send({ employeeId: "employee-1" }).expect(404);
    await request(app).post("/api/employees/employee-1/scoring-context").set(storeManager).expect(200);
    expect(v1Service.startLiveScoring).toHaveBeenCalledWith("employee-1", expect.objectContaining({ accountId: "manager-1" }));
  });

  it("keeps round GET routes read-only and writes only through PUT my-evaluation", async () => {
    const { app, v1Service, roundService } = setup();

    await request(app).get("/api/evaluation-rounds/round-1").expect(200);
    await request(app).get("/api/evaluation-rounds/round-1/aggregate").expect(200);
    await request(app).get("/api/evaluation-rounds/round-1/my-evaluation").expect(200);

    expect(roundService.getRound).toHaveBeenCalledOnce();
    expect(roundService.getAggregate).toHaveBeenCalledOnce();
    expect(v1Service.getMyEvaluation).toHaveBeenCalledOnce();

    await request(app).put("/api/evaluation-rounds/round-1/my-evaluation").send({ speedRating: 5, initiativeRating: 5, attitudeRating: 5, availabilityRating: 5, textFeedback: "", skills: [{ skillDefinitionId: "skill-1", status: "Proficient" }] }).expect(200);
    expect(v1Service.submitLiveEvaluation).toHaveBeenCalledWith("round-1", expect.any(Object), expect.objectContaining({ accountId: "test-admin" }));
  });

  it("does not expose the removed qualification apply route", async () => {
    const { app } = setup();
    await request(app).post("/api/evaluation-rounds/round-1/apply-qualifications").expect(404);
  });
});
