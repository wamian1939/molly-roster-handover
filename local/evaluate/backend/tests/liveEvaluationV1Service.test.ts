import { describe, expect, it, vi } from "vitest";
import { EvaluationV1Service } from "../src/evaluationV1Service.js";
import { scoringPolicyV1 } from "../src/scoringPolicyV1.js";

describe("EvaluationV1Service live submission", () => {
  it("previews skill categories before ratings without treating Unknown as CannotDo", async () => {
    const round = {
      id: "round-open",
      status: "OPEN",
      scoringPolicySnapshot: scoringPolicyV1.getPolicy("REGULAR"),
      skillBaselineSnapshot: [{
        skillDefinitionId: "skill-opening", skillCode: "opening", skillNameZh: "开早", skillNameEn: "Opening",
        category: "OPERATIONS", skillMode: "BINARY", weight: 1, status: null,
      }],
    };
    const db = { evaluationRound: { findUnique: vi.fn(async () => round) } };
    const roundService = { ensureEvaluatorMembership: vi.fn(async () => ({ id: round.id })) };
    const service = new EvaluationV1Service(db as never, undefined, roundService as never);
    const actor = { accountId: "evaluator-a", userId: "evaluator-a", username: "a", displayName: "A", role: "STORE_EVALUATOR", storeIds: ["store-1"], canAccessAllStores: false } as const;

    const unknown = await service.previewLiveSkills(round.id, { skills: [{ skillDefinitionId: "skill-opening", status: "Unknown" }] }, actor);
    const canDo = await service.previewLiveSkills(round.id, { skills: [{ skillDefinitionId: "skill-opening", status: "CanDo" }] }, actor);

    expect(unknown.componentScore).toBeNull();
    expect(unknown.skillCategories.operations).toMatchObject({ percentage: null, confirmedCount: 0, capableCount: 0, totalCount: 1 });
    expect(canDo).toMatchObject({ componentScore: 60, overallRatio: 1, skillCoverage: { capableSkills: 1, activeSkills: 1, percentage: 100 } });
    expect(canDo.skillCategories.operations).toMatchObject({ percentage: 100, confirmedCount: 1, capableCount: 1, totalCount: 1 });
  });

  it("inserts once and updates the same evaluator + round row on later submissions", async () => {
    let currentEvaluationId: string | null = null;
    const evaluationCreate = vi.fn(async () => {
      currentEvaluationId = "evaluation-current";
      return { id: currentEvaluationId };
    });
    const evaluationUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: currentEvaluationId, ...data }));
    const round = {
      id: "round-open",
      employeeId: "employee-1",
      storeId: "store-1",
      status: "OPEN",
      scoringVersion: "v1",
      employeeTypeSnapshot: "REGULAR",
      scoringPolicySnapshot: scoringPolicyV1.getPolicy("REGULAR"),
      skillBaselineSnapshot: [{
        skillDefinitionId: "skill-1", skillCode: "tea", skillNameZh: "开茶", skillNameEn: "Tea",
        category: "BACK_OF_HOUSE", skillMode: "PROGRESSIVE", weight: 1, status: "Independent",
      }],
      employee: { id: "employee-1", displayName: "HandoverEmployee006", status: "Active" },
      store: { id: "store-1", name: "Hurstville", isActive: true },
    };
    const db = {
      evaluationRound: { findUnique: vi.fn(async () => round) },
      evaluation: {
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          "roundId_evaluatorAccountId" in where && currentEvaluationId ? { id: currentEvaluationId } : null),
        create: evaluationCreate,
        update: evaluationUpdate,
      },
      evaluationAiRun: {
        deleteMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({ id: "ai-run" })),
      },
      evaluationSkillSnapshot: {
        deleteMany: vi.fn(async () => ({ count: 1 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      employeeSkill: { upsert: vi.fn(async () => ({})) },
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => [{ isActive: true }]),
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
    };
    const roundService = {
      ensureEvaluatorMembership: vi.fn(async () => ({ id: round.id, employeeId: round.employeeId, storeId: round.storeId })),
    };
    const service = new EvaluationV1Service(db as never, undefined, roundService as never);
    vi.spyOn(service, "getEvaluation").mockImplementation(async (id) => ({ id } as never));
    const actor = { accountId: "evaluator-a", userId: "evaluator-a", username: "a", displayName: "A", role: "STORE_EVALUATOR", storeIds: ["store-1"], canAccessAllStores: false } as const;
    const first = { speedRating: 2, initiativeRating: 2, attitudeRating: 2, availabilityRating: 2, textFeedback: "", skills: [{ skillDefinitionId: "skill-1", status: "Independent" }] } as const;
    const second = { ...first, speedRating: 5 as const };

    const firstResult = await service.submitLiveEvaluation(round.id, first, actor);
    const secondResult = await service.submitLiveEvaluation(round.id, second, actor);

    expect(firstResult.id).toBe("evaluation-current");
    expect(secondResult.id).toBe("evaluation-current");
    expect(evaluationCreate).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(evaluationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "evaluation-current" },
      data: expect.objectContaining({ speedRating: 5, evaluationStatus: "Submitted", version: { increment: 1 } }),
    }));
    // A transfer during text analysis must invalidate the old store's write.
    roundService.ensureEvaluatorMembership.mockImplementationOnce(async () => {
      round.storeId = "store-2";
      return { id: round.id, employeeId: round.employeeId, storeId: "store-1" };
    });
    const writes = evaluationUpdate.mock.calls.length;
    await expect(service.submitLiveEvaluation(round.id, second, actor)).rejects.toMatchObject({ status: 403 });
    expect(evaluationUpdate).toHaveBeenCalledTimes(writes);
  });
});
