import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { EmployeeEvaluationSummaryService } from "../src/employeeEvaluationSummaryService.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

function employee(skills: unknown[] = []) {
  return {
    id: "emp-1",
    storeId: "store-1",
    name: "HandoverEmployee016",
    role: "Barista",
    employmentType: "PartTime",
    tenure: "1y",
    status: "Active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    archivedAt: null,
    openingQualified: "Qualified",
    closingQualified: "Unknown",
    weeklyCleaningQualified: "Qualified",
    store: { id: "store-1", name: "Hurstville", region: "South", managerName: "Winnie", city: "Sydney" },
    _count: { evaluations: 3 },
    skills,
  };
}

function completed(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1-older",
    employeeId: "emp-1",
    storeId: "store-1",
    evaluatorId: "manager-1",
    evaluationPeriod: "2026 Q2",
    evaluationStatus: "Completed",
    scoringVersion: "v1",
    attitudeScore: null,
    attendanceScore: null,
    skillScore: null,
    pressureHandlingScore: null,
    teamworkScore: null,
    executionScore: null,
    serviceQualityScore: null,
    growthPotentialScore: null,
    manualWeightedScore: null,
    textReview: null,
    aiTextScore: null,
    aiRiskScore: null,
    riskLevel: null,
    finalScore: null,
    grade: null,
    speedRating: null,
    initiativeRating: null,
    attitudeRating: null,
    availabilityRating: null,
    skillScoreV1: null,
    speedScoreV1: null,
    initiativeScoreV1: null,
    attitudeScoreV1: null,
    availabilityScoreV1: null,
    textScoreV1: null,
    overallScoreV1: null,
    tierV1: null,
    skillCoverageV1: null,
    textFeedback: null,
    textScoreSourceV1: null,
    selectedAiRunId: null,
    employeeNameSnapshot: null,
    employeeRoleSnapshot: null,
    storeNameSnapshot: null,
    evaluatorNameSnapshot: null,
    version: 0,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    completedAt: new Date("2026-06-30T00:00:00.000Z"),
    employee: employee(),
    store: { id: "store-1", name: "Hurstville", region: "South", managerName: "Winnie", city: "Sydney" },
    ...overrides,
  };
}

function v1Completed(overrides: Record<string, unknown> = {}) {
  return completed({
    id: "v1-1",
    evaluationPeriod: "2026 Q3",
    scoringVersion: "v1",
    finalScore: null,
    grade: null,
    skillScoreV1: new Prisma.Decimal(41),
    speedScoreV1: new Prisma.Decimal(9.6),
    initiativeScoreV1: new Prisma.Decimal(8),
    attitudeScoreV1: new Prisma.Decimal(10),
    availabilityScoreV1: new Prisma.Decimal(6.4),
    textScoreV1: new Prisma.Decimal(7.4),
    overallScoreV1: new Prisma.Decimal(82.4),
    tierV1: "T2",
    skillCoverageV1: new Prisma.Decimal(0.8),
    employeeNameSnapshot: "HandoverEmployee016 Snapshot",
    employeeRoleSnapshot: "Crew Snapshot",
    storeNameSnapshot: "Hurstville Snapshot",
    completedAt: new Date("2026-08-12T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    ...overrides,
  });
}

describe("EmployeeEvaluationSummaryService", () => {
  it("keeps current skills separate from the latest CLOSED-round snapshot", async () => {
    const currentSkill = {
      skillDefinitionId: "skill-tea",
      status: "Proficient",
      updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      skillDefinition: {
        id: "skill-tea",
        code: "tea",
        nameZh: "开茶-Current",
        nameEn: "Tea Current",
        category: "BackKitchen",
        weight: new Prisma.Decimal(1.5),
        displayOrder: 1,
        isActive: true,
      },
    };
    const rows = [v1Completed(), completed()];
    const db = {
      employee: { findUnique: vi.fn(async () => employee([currentSkill])) },
      evaluation: { findMany: vi.fn(async () => rows), findFirst: vi.fn() },
      $queryRaw: vi.fn(async () => [{ id: "round-v1-1" }]),
      evaluationRound: { findMany: vi.fn(async () => [roundFromEvaluation(v1Completed(), { employee: { id: "emp-1", name: "HandoverEmployee016 Snapshot", role: "Crew Snapshot" } })]) },
    };
    const v1Service = {
      getEvaluation: vi.fn(async () => ({
        id: "v1-1",
        scoringVersion: "v1",
        status: "Completed",
        skills: [{ skillCode: "tea", skillNameZh: "开茶-Snapshot", status: "Independent" }],
      })),
    };
    const service = new EmployeeEvaluationSummaryService(db as never, v1Service as never);

    const summary = await service.getSummary("emp-1", ["store-1"]);

    expect(summary.currentSkills[0]).toMatchObject({ skillNameZh: "开茶-Current", status: "Proficient" });
    expect(summary.latestEvaluation).toMatchObject({
      skills: [{ skillNameZh: "开茶-Snapshot", status: "Independent" }],
    });
    expect(summary.history.map((item) => item.id)).toEqual(["round-v1-1"]);
    expect(summary.history.every((item) => item.scoringVersion === "v1")).toBe(true);
    expect(db.evaluation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        evaluationStatus: "Completed",
        scoringVersion: "v1",
        completedAt: { not: null },
        storeId: { in: ["store-1"] },
      }),
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }));
  });

  it("returns an explicit uninitialized profile instead of synthesizing NotTrained skills", async () => {
    const db = {
      employee: { findUnique: vi.fn(async () => employee([])) },
      evaluation: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
      evaluationRound: { findMany: vi.fn(async () => []) },
    };
    const service = new EmployeeEvaluationSummaryService(db as never, { getEvaluation: vi.fn() } as never);

    const summary = await service.getSummary("emp-1");

    expect(summary.currentSkillProfileInitialized).toBe(false);
    expect(summary.currentSkills).toEqual([]);
    expect(summary.latestEvaluation).toBeNull();
    expect(summary.history).toEqual([]);
  });
});
