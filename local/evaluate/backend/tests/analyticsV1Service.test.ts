import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsV1Service } from "../src/analyticsV1Service.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

const stores = [
  { id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" },
  { id: "store-2", name: "Chatswood", region: "Sydney", managerName: "Kelly", city: "Sydney" },
];
const activeSkills = [
  { id: "skill-tea", code: "tea", nameZh: "开茶", nameEn: "Tea Preparation", category: "Back Kitchen", weight: 1.5, displayOrder: 1, isActive: true },
  { id: "skill-bar", code: "bar", nameZh: "奶吧", nameEn: "Milk Bar", category: "Back Kitchen", weight: 1.5, displayOrder: 2, isActive: true },
];
const employees = [
  employee("employee-1", "HandoverEmployee016", [skill("skill-tea", "Independent"), skill("skill-bar", "Training")]),
  employee("employee-2", "Alex", [skill("skill-tea", "Proficient")]),
  employee("employee-3", "No Profile", []),
];
const evaluations = [
  evaluation("eval-1-new", "employee-1", 80, "T2", "2026-08-10", { speed: 4, initiative: 3, attitude: 5, availability: 2, skillScore: 40 }),
  evaluation("eval-1-old", "employee-1", 70, "T2", "2026-07-10", { speed: 3, initiative: 3, attitude: 4, availability: 2, skillScore: 35 }),
  evaluation("eval-2", "employee-2", 50, "T4", "2026-08-11", { speed: 2, initiative: 2, attitude: 3, availability: 2, skillScore: 20 }),
];
let db: ReturnType<typeof createDb>;
let service: AnalyticsV1Service;

beforeEach(() => {
  db = createDb();
  service = new AnalyticsV1Service(db as never);
});

describe("AnalyticsV1Service", () => {
  it("builds current Dashboard population from latest Completed V1 only", async () => {
    const result = await service.getDashboard(["store-1"]);

    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.evaluationRound.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["round-eval-1-new", "round-eval-2"] } } }));

    expect(result.summary).toMatchObject({
      employees: 3,
      evaluatedEmployees: 2,
      notEvaluatedEmployees: 1,
      averageScore: 65,
      averageSkillScore: 30,
      evaluationCoverage: 0.6667,
    });
    expect(result.tierDistribution).toEqual([
      { tier: "T1", count: 0, percentage: 0 },
      { tier: "T2", count: 1, percentage: 50 },
      { tier: "T3", count: 0, percentage: 0 },
      { tier: "T4", count: 1, percentage: 50 },
      { tier: "T5", count: 0, percentage: 0 },
    ]);
    expect(result.topEmployees.map((employee) => employee.employeeId)).toEqual(["employee-1", "employee-2"]);
    expect(result.topEmployees[0]).toMatchObject({ employeeId: "employee-1" });
    expect(result.notEvaluatedEmployees.map((employee) => employee.employeeId)).toEqual(["employee-3"]);
    expect(result.notEvaluatedEmployees[0]).toMatchObject({ employeeId: "employee-3" });
    expect(result.needsAttention).toEqual([
      expect.objectContaining({ employeeId: "employee-2", reasons: ["LowOverallScore"] }),
    ]);
  });

  it("uses Current EmployeeSkill and keeps unknown data separate from NotTrained", async () => {
    const result = await service.getAnalytics(["store-1"]);

    expect(result.skillProfiles).toEqual({ initializedEmployees: 1, totalEmployees: 3 });
    expect(result.summary.averageCurrentSkillCoverage).toBe(0.5);
    expect(result.skillCoverage).toEqual([
      expect.objectContaining({
        skillDefinitionId: "skill-bar",
        qualifiedEmployees: 0,
        knownEmployees: 1,
        totalEmployees: 3,
        coverage: 0.3,
        profileCompletion: 0.3333,
      }),
      expect.objectContaining({
        skillDefinitionId: "skill-tea",
        qualifiedEmployees: 2,
        knownEmployees: 2,
        totalEmployees: 3,
        coverage: 0.85,
        profileCompletion: 0.6667,
      }),
    ]);
    expect(result.categoryCoverage).toEqual([{ category: "Back Kitchen", coverage: 0.575, activeSkills: 2 }]);
  });

  it("averages four raw latest ratings and identifies the deterministic weakest dimension", async () => {
    const result = await service.getAnalytics(["store-1"]);
    expect(result.averageRatings).toEqual([
      { dimension: "speed", average: 3, sampleSize: 2 },
      { dimension: "initiative", average: 2.5, sampleSize: 2 },
      { dimension: "attitude", average: 4, sampleSize: 2 },
      { dimension: "availability", average: 2, sampleSize: 2 },
    ]);
    expect(result.weakestDimension).toEqual({ dimension: "availability", average: 2, sampleSize: 2 });
  });

  it("uses latest versus immediately previous for movement and saved monthly scores for trend", async () => {
    const result = await service.getAnalytics(["store-1"]);
    expect(result.mostImproved).toEqual([
      expect.objectContaining({ employeeId: "employee-1", latestScore: 80, previousScore: 70, delta: 10 }),
    ]);
    expect(result.scoreDecreased).toEqual([]);
    expect(result.scoreTrend).toEqual([
      { month: "2026-07", averageCompletedEvaluationScore: 70, completedEvaluations: 1 },
      { month: "2026-08", averageCompletedEvaluationScore: 65, completedEvaluations: 2 },
    ]);
    expect(result.employees.find((employee) => employee.employeeId === "employee-1")?.overallScore).toBe(80);
  });

  it("applies Store scope before aggregation and performs no per-employee queries", async () => {
    await service.getAnalytics(["store-1", "store-2"], "store-1");
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.employee.findMany).toHaveBeenCalledOnce();
    expect(db.evaluation.findMany).not.toHaveBeenCalled();
    expect(db.evaluationRound.findMany).toHaveBeenCalledOnce();
    expect(db.employee.findMany.mock.calls[0]?.[0].where).toMatchObject({ storeId: { in: ["store-1"] }, status: "Active" });
    expect(db.store.findMany.mock.calls[0]?.[0].where).toEqual({ isActive: true, id: { in: ["store-1", "store-2"] } });
  });

  it("rejects a selected Store outside the authorized scope before querying", async () => {
    await expect(service.getAnalytics(["store-1"], "store-2")).rejects.toMatchObject({ status: 403 });
    await expect(service.getDashboard(["store-1"], "store-2")).rejects.toMatchObject({ status: 403 });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });
});

function createDb() {
  const invalidRound = roundFromEvaluation(evaluation("eval-invalid", "employee-1", 95, "T1", "2026-09-10", { speed: 5, initiative: 5, attitude: 5, availability: 5, skillScore: 50 }));
  invalidRound.evaluators = [];
  const rounds = [invalidRound, ...evaluations.map((row) => roundFromEvaluation(row))];
  return {
    $queryRaw: vi.fn(async () => [{ id: "round-eval-1-new" }, { id: "round-eval-2" }]),
    store: { findMany: vi.fn(async () => stores) },
    skillDefinition: { findMany: vi.fn(async () => activeSkills) },
    employee: { findMany: vi.fn(async () => employees) },
    evaluation: {
      findMany: vi.fn(async () => []),
    },
    evaluationRound: { findMany: vi.fn(async (query?: { where?: { id?: { in?: string[] } } }) => rounds
      .filter((row) => !query?.where?.id?.in || query.where.id.in.includes(row.id))) },
  };
}

function employee(id: string, name: string, skills: Array<{ skillDefinitionId: string; status: string }>) {
  return {
    id,
    storeId: "store-1",
    name,
    role: "Barista",
    employmentType: "PartTime",
    tenure: "1y",
    status: "Active",
    store: stores[0],
    skills,
  };
}

function skill(skillDefinitionId: string, status: string) {
  return { skillDefinitionId, status };
}

function evaluation(
  id: string,
  employeeId: string,
  overallScoreV1: number,
  tierV1: string,
  completedAt: string,
  values: { speed: number; initiative: number; attitude: number; availability: number; skillScore: number },
) {
  return {
    id,
    employeeId,
    storeId: "store-1",
    overallScoreV1,
    tierV1,
    skillScoreV1: values.skillScore,
    speedRating: values.speed,
    initiativeRating: values.initiative,
    attitudeRating: values.attitude,
    availabilityRating: values.availability,
    completedAt: new Date(`${completedAt}T10:00:00.000Z`),
  };
}
