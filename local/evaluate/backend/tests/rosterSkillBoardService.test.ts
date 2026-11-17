import { beforeEach, describe, expect, it, vi } from "vitest";
import { RosterSkillBoardService } from "../src/rosterSkillBoardService.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

const stores = [
  { id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" },
  { id: "store-2", name: "Chatswood", region: "Sydney", managerName: "Kelly", city: "Sydney" },
];

const activeSkills = [
  skillDefinition("skill-tea", "tea-preparation", "开茶", "Tea Preparation", "Back Kitchen", 10),
  skillDefinition("skill-milk", "milk-bar", "奶吧", "Milk Bar", "Back Kitchen", 20),
  skillDefinition("skill-cup", "cup-labeling", "贴杯", "Cup Labeling", "Bar", 30),
  skillDefinition("skill-scan", "order-scanning", "扫码", "Order Scanning", "Bar", 40),
];

const employees = [
  employee("employee-1", "HandoverEmployee016", "store-1", [
    employeeSkill("skill-tea", "Independent"),
    employeeSkill("skill-milk", "Proficient"),
    employeeSkill("skill-cup", "Training"),
  ]),
  employee("employee-2", "Bob", "store-1", [
    employeeSkill("skill-tea", "Training"),
    employeeSkill("skill-milk", "NotTrained"),
    employeeSkill("skill-cup", "Proficient"),
    employeeSkill("skill-scan", "Independent"),
  ]),
];

const completedEvaluations = [
  completedEvaluation("eval-completed-new", "employee-1", 82.4, "T2", "2026-08-12", 4, 4),
  completedEvaluation("eval-completed-old", "employee-1", 70, "T3", "2026-08-01", 2, 2),
  completedEvaluation("eval-completed-bob", "employee-2", 91, "T1", "2026-08-11", 5, 3),
];

let db: ReturnType<typeof createDb>;
let service: RosterSkillBoardService;

beforeEach(() => {
  db = createDb();
  service = new RosterSkillBoardService(db as never);
});

describe("RosterSkillBoardService", () => {
  it("rejects a selected Store outside the authorized scope before querying", async () => {
    await expect(service.getBoard(["store-1"], "store-2")).rejects.toMatchObject({ status: 403 });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("returns active employees with current EmployeeSkill and latest CLOSED round", async () => {
    const result = await service.getBoard(["store-1"], "store-1");

    expect(result.employees).toHaveLength(2);
    expect(result.skillDefinitions.map((definition) => definition.code)).toEqual([
      "tea-preparation",
      "milk-bar",
      "cup-labeling",
      "order-scanning",
    ]);
    expect(result.employees[0]).toMatchObject({
      employeeId: "employee-1",
      displayName: "HandoverEmployee016",
      latestEvaluation: {
        id: "round-eval-completed-new",
        overallScore: 82.4,
        tier: "T2",
        speedRating: 4,
        availabilityRating: 4,
      },
    });
    expect(result.employees[0].skills).toEqual([
      expect.objectContaining({ skillDefinitionId: "skill-tea", status: "Independent" }),
      expect.objectContaining({ skillDefinitionId: "skill-milk", status: "Proficient" }),
      expect.objectContaining({ skillDefinitionId: "skill-cup", status: "Training" }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Grade|AI Risk|Synthetic|attitudeScore|attendanceScore|EvaluationSkillSnapshot/i);
  });

  it("applies store scope and uses a finite query set", async () => {
    await service.getBoard(["store-1"], "store-1");

    expect(db.store.findMany).toHaveBeenCalledOnce();
    expect(db.skillDefinition.findMany).toHaveBeenCalledOnce();
    expect(db.employee.findMany).toHaveBeenCalledOnce();
    expect(db.evaluation.findMany).not.toHaveBeenCalled();
    expect(db.evaluationRound.findMany).toHaveBeenCalledOnce();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.evaluationRound.findMany.mock.calls[0]?.[0].where).toMatchObject({ id: { in: ["round-eval-completed-new", "round-eval-completed-bob"] } });
    expect(db.employee.findMany.mock.calls[0]?.[0].where).toMatchObject({
      storeId: { in: ["store-1"] },
      status: "Active",
    });
  });
});

function createDb() {
  return {
    store: { findMany: vi.fn(async () => stores) },
    skillDefinition: { findMany: vi.fn(async () => activeSkills) },
    employee: { findMany: vi.fn(async () => employees) },
    evaluation: { findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => [{ id: "round-eval-completed-new" }, { id: "round-eval-completed-bob" }]),
    evaluationRound: { findMany: vi.fn(async () => completedEvaluations.filter((row) => row.id !== "eval-completed-old").map((row) => roundFromEvaluation(row))) },
  };
}

function skillDefinition(id: string, code: string, nameZh: string, nameEn: string, category: string, displayOrder: number) {
  return { id, code, nameZh, nameEn, category, weight: 1, displayOrder, isActive: true };
}

function employeeSkill(skillDefinitionId: string, status: string) {
  return {
    skillDefinitionId,
    status,
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    skillDefinition: activeSkills.find((definition) => definition.id === skillDefinitionId),
  };
}

function employee(
  id: string,
  displayName: string,
  storeId: string,
  skills: ReturnType<typeof employeeSkill>[],
) {
  return {
    id,
    storeId,
    displayName,
    employmentType: "PartTime",
    status: "Active",
    store: stores.find((store) => store.id === storeId),
    skills,
  };
}

function completedEvaluation(
  id: string,
  employeeId: string,
  overallScoreV1: number,
  tierV1: string,
  completedAt: string,
  speedRating: number,
  availabilityRating: number,
) {
  return {
    id,
    employeeId,
    storeId: "store-1",
    overallScoreV1,
    tierV1,
    speedRating,
    initiativeRating: 4,
    attitudeRating: 5,
    availabilityRating,
    skillCoverageV1: 0.8,
    completedAt: new Date(`${completedAt}T10:00:00.000Z`),
  };
}
