import { describe, expect, it, vi } from "vitest";
import { RosterIntegrationService } from "../src/rosterIntegrationService.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

describe("RosterIntegrationService", () => {
  it("selects only active skill definitions for shift-role validation", async () => {
    const db = createDb();
    const result = await new RosterIntegrationService(db as never).listSkillDefinitions();
    expect(result.skills.map((skill) => skill.code)).toEqual(["tea-preparation", "milk-bar", "opening"]);
    expect(db.skillDefinition.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, select: { code: true, nameZh: true, category: true, skillMode: true } }));
  });
  it("returns a minimum PII-safe employee DTO with CLOSED official score and current skills", async () => {
    const db = createDb();
    const service = new RosterIntegrationService(db as never);
    const result = await service.listEmployees("store-1", ["store-1"]);

    expect(result.contractVersion).toBe("1.4.0");
    expect(result.employees[0]).toMatchObject({
      id: "employee-1", displayName: "HandoverEmployee006", storeId: "store-1", isActive: true,
      officialScore: { score: 82.4, tier: "T2", roundId: "round-1" },
      positions: [{ id: "job-1", code: "trainer" }],
      skillSummary: { backOfHousePercent: 50, operations: { opening: "CAN_DO", closing: "UNKNOWN", weeklyCleaning: "UNKNOWN" } },
    });
    expect(JSON.stringify(result)).not.toMatch(/taxFile|bankAccount|bsb|dateOfBirth|address|visa|superannuation|textFeedback|evaluator|aiEvidence/i);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.evaluationRound.findMany.mock.calls[0]?.[0].where).toMatchObject({ id: { in: ["round-1"] } });
  });

  it("scopes archived lookup inside the database predicate", async () => {
    const db = createDb();
    const service = new RosterIntegrationService(db as never);
    await service.getEmployee("employee-1", ["store-1"]);
    expect(db.employee.findMany.mock.calls[0]?.[0].where).toMatchObject({ id: "employee-1", storeId: { in: ["store-1"] } });
  });

  it("exports multiple explicit positions and excludes a stale cross-store job", async () => {
    const db = createDb();
    const employee = (await db.employee.findMany())[0];
    employee.jobAssignments.push(
      { job: { id: "job-2", storeId: "store-1", code: "front-house", name: "Front house", colorToken: "teal" } },
      { job: { id: "job-3", storeId: "store-2", code: "wrong-store", name: "Wrong store", colorToken: "slate" } },
    );
    const result = await new RosterIntegrationService(db as never).listEmployees("store-1", ["store-1"]);
    expect(result.employees[0]?.positions.map((position) => position.code)).toEqual(["trainer", "front-house"]);
    expect(result.employees[0]?.jobs).toHaveLength(2);
    expect(db.employee.findMany.mock.calls.at(-1)?.[0].select.jobAssignments.where).toEqual({ job: { isActive: true } });
  });

  it("limits database rows and reports pagination metadata", async () => {
    const db = createDb();
    const response = await new RosterIntegrationService(db as never).listEmployees("store-1", ["store-1"], 2, 10);
    expect(db.employee.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10 });
    expect(response.pagination).toEqual({ page: 2, pageSize: 10, total: 21, hasMore: true });
    expect(response.workforceRevision).toBe("revision-1");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });
});

function createDb() {
  const definitions = [
    { id: "tea", code: "tea-preparation", nameZh: "开茶", category: "Back Kitchen", skillMode: "PROGRESSIVE", displayOrder: 1 },
    { id: "milk", code: "milk-bar", nameZh: "奶吧", category: "Back Kitchen", skillMode: "PROGRESSIVE", displayOrder: 2 },
    { id: "opening", code: "opening", nameZh: "开早", category: "Operations", skillMode: "BINARY", displayOrder: 3 },
  ];
  const employee = {
    id: "employee-1", displayName: "HandoverEmployee006", employeeType: "REGULAR", employmentType: "PartTime", storeId: "store-1", status: "Active",
    store: { name: "Hurstville", isActive: true },
    jobAssignments: [{ job: { id: "job-1", storeId: "store-1", code: "trainer", name: "带训员", colorToken: "violet" } }],
    skills: [
      { status: "Proficient", updatedAt: new Date("2026-09-07T00:00:00.000Z"), skillDefinition: definitions[0] },
      { status: "Training", updatedAt: new Date("2026-09-07T00:00:00.000Z"), skillDefinition: definitions[1] },
      { status: "CanDo", updatedAt: new Date("2026-09-07T00:00:00.000Z"), skillDefinition: definitions[2] },
    ],
  };
  const evaluation = { id: "1", employeeId: employee.id, storeId: employee.storeId, overallScoreV1: 82.4, tierV1: "T2", speedRating: 4, initiativeRating: 4, attitudeRating: 4, availabilityRating: 4, skillCoverageV1: .5, completedAt: new Date("2026-09-06T12:00:00.000Z") };
  const round = roundFromEvaluation(evaluation); round.id = "round-1";
  const db = {
    store: { findMany: vi.fn(async () => [{ id: "store-1", name: "Hurstville", isActive: true }]) },
    skillDefinition: { findMany: vi.fn(async () => definitions) },
    employee: { findMany: vi.fn(async () => [employee]), count: vi.fn(async () => 21) },
    $queryRaw: vi.fn(async (query: { strings?: string[] }) => query.strings?.join("").includes("string_agg") ? [{ revision: "revision-1" }] : [{ id: "round-1" }]),
    evaluationRound: { findMany: vi.fn(async () => [round]) },
  };
  return { ...db, $transaction: vi.fn(async (callback: (client: typeof db) => unknown) => callback(db)) };
}
