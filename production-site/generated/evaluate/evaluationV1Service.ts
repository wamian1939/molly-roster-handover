import {
  EvaluationAiEvidenceType,
  EvaluationAiRunStatus,
  Prisma,
  SkillStatus,
  V1TextScoreSource,
  type PrismaClient,
} from "@prisma/client";
import type { z } from "zod";
import { AiTextEvaluationV1Service, type AiTextResultV1, type TextAnalyzerV1 } from "./aiTextEvaluationV1.js";
import { requireStoreAccess, type AuthContext } from "./auth.js";
import { EvaluationRoundService } from "./evaluationRoundService.js";
import { createHttpError } from "./httpError.js";
import {
  calculateScoreV1,
  calculateSkillCategoryBreakdownV1,
  parsePolicySnapshotV1,
  scoringPolicyV1,
  skillStatusFactors,
  type SkillStatusV1,
} from "./scoringPolicyV1.js";
import type { liveEvaluationSubmissionSchema, liveSkillPreviewSchema } from "./validation.js";

type LiveSubmissionInput = z.infer<typeof liveEvaluationSubmissionSchema>;
type LiveSkillPreviewInput = z.infer<typeof liveSkillPreviewSchema>;

type TextOutcome = {
  status: EvaluationAiRunStatus;
  source: V1TextScoreSource;
  provider: string;
  model: string;
  textFeedback: string;
  textScore: number;
  positiveEvidence: string[];
  concernEvidence: string[];
  possibleSkillUpdates: AiTextResultV1["possibleSkillUpdates"];
  rawResponse?: unknown;
  errorMessage?: string;
};

const v1EvaluationInclude = {
  employee: true,
  store: true,
  round: {
    select: {
      id: true,
      status: true,
      evaluators: { where: { excludedAt: null }, select: { evaluatorAccountId: true } },
      evaluations: { select: { evaluatorAccountId: true, evaluationStatus: true } },
    },
  },
  skillSnapshots: { orderBy: { createdAt: "asc" as const } },
  v1AiRuns: {
    include: { evidence: true },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.EvaluationInclude;

type V1EvaluationRecord = Prisma.EvaluationGetPayload<{ include: typeof v1EvaluationInclude }>;

export class EvaluationV1Service {
  constructor(
    private readonly db: PrismaClient,
    private readonly textAnalyzer: TextAnalyzerV1 = new AiTextEvaluationV1Service(),
    private readonly roundService = new EvaluationRoundService(db),
  ) {}

  private findRoundEvaluation(roundId: string, evaluatorAccountId: string) {
    return this.db.evaluation.findUnique({
      where: { roundId_evaluatorAccountId: { roundId, evaluatorAccountId } },
      select: { id: true },
    });
  }

  async getMyEvaluation(roundId: string, actor: AuthContext) {
    const round = await this.roundService.getRound(roundId, actor);
    const existing = await this.findRoundEvaluation(roundId, actor.accountId);
    if (!existing) return null;
    return withRoundProgress(await this.getEvaluation(existing.id, actor), round);
  }

  async startLiveScoring(employeeId: string, actor: AuthContext) {
    const round = await this.roundService.getOrCreateOpenRound(employeeId, actor);
    return this.getLiveScoringContext(round.id, actor);
  }

  async getLiveScoringContext(roundId: string, actor: AuthContext) {
    const summary = await this.roundService.getRound(roundId, actor);
    if (summary.status !== "OPEN") throw createHttpError(409, "This round is closed.");
    await this.roundService.ensureEvaluatorMembership(roundId, actor, true);
    const round = await this.db.evaluationRound.findUnique({
      where: { id: roundId },
      include: {
        employee: true,
        store: true,
        evaluations: {
          where: { evaluatorAccountId: actor.accountId },
          include: v1EvaluationInclude,
        },
      },
    });
    if (!round || round.status !== "OPEN") throw createHttpError(409, "This round is closed.");
    const existing = round.evaluations[0];
    if (existing) return withRoundProgress(toV1Dto(existing), summary);

    const definitions = baselineDefinitions(round.skillBaselineSnapshot);
    const skillCategories = calculateSkillCategoryBreakdownV1(
      definitions.map((item) => ({
        id: item.id,
        weight: item.weight,
        isActive: true,
        category: item.category,
        skillMode: item.skillMode,
      })),
      definitions.map((item) => ({ skillDefinitionId: item.id, status: item.status ?? "Unknown" })),
    );
    return {
      id: `unsubmitted:${round.id}:${actor.accountId}`,
      roundId: round.id,
      employeeId: round.employeeId,
      employeeName: round.employee.displayName,
      storeId: round.storeId,
      storeName: round.store.name,
      status: "Unsubmitted" as const,
      scoringVersion: round.scoringVersion,
      employeeTypeSnapshot: round.employeeTypeSnapshot,
      round: {
        id: round.id,
        status: round.status,
        completedCount: summary.completedCount,
        eligibleCount: summary.eligibleCount,
      },
      policy: parsePolicySnapshotV1(round.scoringPolicySnapshot),
      version: 0,
      ratings: { speed: null, initiative: null, attitude: null, availability: null },
      textFeedback: "",
      textScoreSource: null,
      skills: definitions.map((definition) => ({
        skillDefinitionId: definition.id,
        skillCode: definition.code,
        skillNameZh: definition.nameZh,
        skillNameEn: definition.nameEn,
        category: definition.category,
        skillMode: definition.skillMode,
        status: definition.status ?? "Unknown",
        weight: definition.weight,
      })),
      skillCategories,
      skill: null,
      scores: null,
      ai: null,
      evaluatorId: actor.accountId,
      evaluatorNameSnapshot: actor.displayName,
      createdAt: round.openedAt.toISOString(),
      updatedAt: round.openedAt.toISOString(),
      submittedAt: null,
      completedAt: null,
    };
  }

  async previewLiveSubmission(roundId: string, input: LiveSubmissionInput, actor: AuthContext, textScore?: number) {
    await this.roundService.ensureEvaluatorMembership(roundId, actor, true);
    const round = await this.db.evaluationRound.findUnique({
      where: { id: roundId },
      select: { employeeTypeSnapshot: true, scoringPolicySnapshot: true, skillBaselineSnapshot: true, status: true },
    });
    if (!round || round.status !== "OPEN") throw createHttpError(409, "This round is closed.");
    return scoreLiveInput(round, input, textScore ?? scoringPolicyV1.defaultTextScoreRaw);
  }

  async previewLiveSkills(roundId: string, input: LiveSkillPreviewInput, actor: AuthContext) {
    await this.roundService.ensureEvaluatorMembership(roundId, actor, true);
    const round = await this.db.evaluationRound.findUnique({
      where: { id: roundId },
      select: { scoringPolicySnapshot: true, skillBaselineSnapshot: true, status: true },
    });
    if (!round || round.status !== "OPEN") throw createHttpError(409, "This round is closed.");
    return previewSkillInput(round, input);
  }

  async analyzeLiveText(roundId: string, textFeedback: string, actor: AuthContext) {
    await this.roundService.ensureEvaluatorMembership(roundId, actor, true);
    return toTextOutcomeDto(await this.evaluateText(textFeedback));
  }

  async submitLiveEvaluation(roundId: string, input: LiveSubmissionInput, actor: AuthContext) {
    await this.roundService.ensureEvaluatorMembership(roundId, actor, true);
    const outcome = await this.evaluateText(input.textFeedback);
    const submittedAt = new Date();

    const evaluationId = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-round:${roundId}`}))`;
      const round = await tx.evaluationRound.findUnique({
        where: { id: roundId },
        include: { employee: true, store: true },
      });
      if (!round || round.status !== "OPEN") throw createHttpError(409, "This round is closed.");
      requireStoreAccess(actor, round.storeId);
      // Hold a shared store row lock until submission commits. Archive takes an
      // exclusive lock before removing OPEN submissions, so neither operation
      // can leave a new score behind in an archived store.
      const activeStore = await tx.$queryRaw<Array<{ isActive: boolean }>>`
        SELECT "isActive" FROM "stores" WHERE "id" = ${round.storeId} FOR SHARE
      `;
      if (round.employee.status !== "Active" || !activeStore[0]?.isActive) {
        throw createHttpError(409, "Employee is inactive, archived, or belongs to an archived store.");
      }

      const definitions = baselineDefinitions(round.skillBaselineSnapshot);
      const score = scoreLiveInput(round, input, outcome.textScore);
      const statusById = new Map(input.skills.map((item) => [item.skillDefinitionId, item.status]));
      const existing = await tx.evaluation.findUnique({
        where: { roundId_evaluatorAccountId: { roundId, evaluatorAccountId: actor.accountId } },
        select: { id: true },
      });
      const baseData = {
        evaluatorId: actor.accountId,
        evaluatorAccountId: actor.accountId,
        evaluatorRoleSnapshot: actor.role,
        evaluationStatus: "Submitted" as const,
        scoringVersion: round.scoringVersion,
        employeeTypeSnapshot: round.employeeTypeSnapshot,
        scoringPolicySnapshot: toJson(round.scoringPolicySnapshot),
        speedRating: input.speedRating,
        initiativeRating: input.initiativeRating,
        attitudeRating: input.attitudeRating,
        availabilityRating: input.availabilityRating,
        textFeedback: input.textFeedback,
        skillScoreV1: decimal(score.skillScore),
        speedScoreV1: decimal(score.speedScore),
        initiativeScoreV1: decimal(score.initiativeScore),
        attitudeScoreV1: decimal(score.attitudeScore),
        availabilityScoreV1: decimal(score.availabilityScore),
        textScoreV1: decimal(score.textScore),
        overallScoreV1: decimal(score.overallScore),
        tierV1: score.tier,
        skillCoverageV1: decimal(score.skillCoverage.ratio),
        textScoreSourceV1: outcome.source,
        employeeNameSnapshot: round.employee.displayName,
        storeNameSnapshot: round.store.name,
        evaluatorNameSnapshot: actor.displayName,
        submittedAt,
        completedAt: null,
      };

      let id: string;
      if (existing) {
        await tx.evaluationAiRun.deleteMany({ where: { evaluationId: existing.id } });
        await tx.evaluationSkillSnapshot.deleteMany({ where: { evaluationId: existing.id } });
        await tx.evaluation.update({
          where: { id: existing.id },
          data: { ...baseData, selectedAiRunId: null, version: { increment: 1 } },
        });
        id = existing.id;
      } else {
        const created = await tx.evaluation.create({
          data: {
            employeeId: round.employeeId,
            storeId: round.storeId,
            roundId,
            evaluationPeriod: null,
            ...baseData,
          },
          select: { id: true },
        });
        id = created.id;
      }

      await tx.evaluationSkillSnapshot.createMany({
        data: definitions.map((definition) => {
          const status = statusById.get(definition.id)!;
          const factor = skillStatusFactors[status];
          return {
            evaluationId: id,
            skillDefinitionId: definition.id,
            skillCode: definition.code,
            skillNameZh: definition.nameZh,
            skillNameEn: definition.nameEn,
            category: definition.category,
            skillMode: definition.skillMode,
            status: status as SkillStatus,
            statusFactor: decimal(factor),
            weight: decimal(definition.weight),
            contribution: decimal(factor * definition.weight),
          };
        }),
      });

      const run = await persistTextOutcome(tx, id, outcome);
      await tx.evaluation.update({ where: { id }, data: { selectedAiRunId: run.id } });
      return id;
    });

    return this.getEvaluation(evaluationId, actor);
  }

  async getEvaluation(evaluationId: string, actor?: AuthContext) {
    const evaluation = await this.db.evaluation.findUnique({
      where: { id: evaluationId },
      include: v1EvaluationInclude,
    });
    if (!evaluation || evaluation.scoringVersion !== scoringPolicyV1.version) {
      throw createHttpError(404, "Evaluation does not exist.");
    }
    assertEvaluationReadAccess(evaluation, actor);
    return toV1Dto(evaluation);
  }

  async getStoreId(evaluationId: string) {
    const evaluation = await this.db.evaluation.findUnique({
      where: { id: evaluationId },
      select: { storeId: true, scoringVersion: true },
    });
    return evaluation?.scoringVersion === scoringPolicyV1.version ? evaluation.storeId : null;
  }

  private async evaluateText(textFeedback: string): Promise<TextOutcome> {
    if (!textFeedback.trim()) return fallbackOutcome(textFeedback);
    try {
      const result = await this.textAnalyzer.analyze(textFeedback);
      return {
        status: "Success",
        source: "Ai",
        provider: result.provider,
        model: result.model,
        textFeedback,
        textScore: clamp(round1(result.textScore), 0, 10),
        positiveEvidence: result.positiveEvidence,
        concernEvidence: result.concernEvidence,
        possibleSkillUpdates: result.possibleSkillUpdates,
        rawResponse: result.rawResponse,
      };
    } catch (error) {
      return fallbackOutcome(textFeedback, sanitizeError(error));
    }
  }
}

type BaselineDefinition = {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  category: string;
  skillMode: "PROGRESSIVE" | "BINARY";
  weight: number;
  status: SkillStatusV1 | null;
};

function baselineDefinitions(value: unknown): BaselineDefinition[] {
  if (!Array.isArray(value)) throw createHttpError(409, "Round skill snapshot is invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw createHttpError(409, "Round skill snapshot is invalid.");
    const row = item as Record<string, unknown>;
    const id = String(row.skillDefinitionId ?? "");
    const status = typeof row.status === "string" && isSkillStatus(row.status) ? row.status : null;
    const skillMode = row.skillMode === "BINARY" ? "BINARY" as const : "PROGRESSIVE" as const;
    const weight = Number(row.weight);
    if (!id || !Number.isFinite(weight) || weight <= 0) throw createHttpError(409, "Round skill snapshot is invalid.");
    return {
      id,
      code: String(row.skillCode ?? id),
      nameZh: String(row.skillNameZh ?? row.skillCode ?? id),
      nameEn: String(row.skillNameEn ?? row.skillCode ?? id),
      category: String(row.category ?? "FRONT_OF_HOUSE"),
      skillMode,
      weight,
      status,
    };
  });
}

function scoreLiveInput(
  round: { employeeTypeSnapshot: "TRAINING" | "REGULAR"; scoringPolicySnapshot: unknown; skillBaselineSnapshot: unknown },
  input: LiveSubmissionInput,
  textScore: number,
) {
  const definitions = baselineDefinitions(round.skillBaselineSnapshot);
  const submitted = new Map(input.skills.map((item) => [item.skillDefinitionId, item.status]));
  if (submitted.size !== definitions.length || definitions.some((definition) => !submitted.has(definition.id))) {
    throw createHttpError(400, "Every skill in this round must be confirmed before submission.");
  }
  return calculateScoreV1({
    skillDefinitions: definitions.map((item) => ({
      id: item.id,
      weight: item.weight,
      isActive: true,
      category: item.category,
      skillMode: item.skillMode,
    })),
    employeeSkills: definitions.map((item) => ({
      skillDefinitionId: item.id,
      status: submitted.get(item.id)!,
    })),
    ratings: {
      speed: input.speedRating,
      initiative: input.initiativeRating,
      attitude: input.attitudeRating,
      availability: input.availabilityRating,
    },
    textScore,
    employeeType: round.employeeTypeSnapshot,
    policy: parsePolicySnapshotV1(round.scoringPolicySnapshot),
  });
}

function previewSkillInput(
  round: { scoringPolicySnapshot: unknown; skillBaselineSnapshot: unknown },
  input: LiveSkillPreviewInput,
) {
  const definitions = baselineDefinitions(round.skillBaselineSnapshot);
  const submitted = new Map(input.skills.map((item) => [item.skillDefinitionId, item.status]));
  if (submitted.size !== definitions.length || definitions.some((definition) => !submitted.has(definition.id))) {
    throw createHttpError(400, "Every skill in this round must be included in the preview.");
  }
  const skillCategories = calculateSkillCategoryBreakdownV1(
    definitions.map((item) => ({
      id: item.id,
      weight: item.weight,
      isActive: true,
      category: item.category,
      skillMode: item.skillMode,
    })),
    definitions.map((item) => ({ skillDefinitionId: item.id, status: submitted.get(item.id)! })),
  );
  const categories = Object.values(skillCategories);
  const weightedRaw = categories.reduce((sum, category) => sum + category.weightedRaw, 0);
  const weightedMax = definitions.reduce((sum, definition) => sum + definition.weight, 0);
  const confirmedCount = categories.reduce((sum, category) => sum + category.confirmedCount, 0);
  const totalCount = definitions.length;
  const capableSkills = categories.reduce((sum, category) => sum + category.capableCount, 0);
  const allConfirmed = totalCount > 0 && confirmedCount === totalCount;
  const overallRatio = allConfirmed && weightedMax > 0 ? Math.round((weightedRaw / weightedMax) * 10000) / 10000 : null;
  const policy = parsePolicySnapshotV1(round.scoringPolicySnapshot);
  return {
    componentScore: overallRatio == null ? null : round1(overallRatio * policy.skillWeight),
    maxScore: policy.skillWeight,
    overallRatio,
    skillCoverage: {
      capableSkills,
      activeSkills: totalCount,
      ratio: totalCount ? Math.round((capableSkills / totalCount) * 10000) / 10000 : 0,
      percentage: totalCount ? round1((capableSkills / totalCount) * 100) : 0,
    },
    skillCategories,
  };
}

function fallbackOutcome(textFeedback: string, errorMessage?: string): TextOutcome {
  return {
    status: "Fallback",
    source: textFeedback.trim() ? "AiFailureFallback" : "NoTextFallback",
    provider: "none",
    model: "none",
    textFeedback,
    textScore: scoringPolicyV1.defaultTextScoreRaw,
    positiveEvidence: [],
    concernEvidence: [],
    possibleSkillUpdates: [],
    errorMessage,
  };
}

async function persistTextOutcome(tx: Prisma.TransactionClient, evaluationId: string, outcome: TextOutcome) {
  return tx.evaluationAiRun.create({
    data: {
      evaluationId,
      status: outcome.status,
      provider: outcome.provider,
      model: outcome.model,
      textFeedbackSnapshot: outcome.textFeedback,
      textScore: decimal(outcome.textScore),
      rawResponse: outcome.rawResponse == null ? undefined : toJson(outcome.rawResponse),
      errorMessage: outcome.errorMessage?.slice(0, 500),
      evidence: { create: evidenceData(outcome) },
    },
  });
}

function evidenceData(outcome: TextOutcome) {
  return [
    ...outcome.positiveEvidence.map((message) => ({ type: "Positive" as EvaluationAiEvidenceType, message })),
    ...outcome.concernEvidence.map((message) => ({ type: "Concern" as EvaluationAiEvidenceType, message })),
    ...outcome.possibleSkillUpdates.map((item) => ({
      type: "PossibleSkillUpdate" as EvaluationAiEvidenceType,
      dimension: item.suggestedStatus,
      skillCode: item.skillCode,
      message: item.message,
      confidence: item.confidence == null ? undefined : decimal(item.confidence),
    })),
  ];
}

function toV1Dto(evaluation: V1EvaluationRecord) {
  const policy = parsePolicySnapshotV1(evaluation.scoringPolicySnapshot);
  const latestRun = evaluation.v1AiRuns.find((run) => run.id === evaluation.selectedAiRunId) ?? evaluation.v1AiRuns[0];
  const scores = evaluation.overallScoreV1 == null ? null : {
    skillScore: Number(evaluation.skillScoreV1),
    speedScore: Number(evaluation.speedScoreV1),
    initiativeScore: Number(evaluation.initiativeScoreV1),
    attitudeScore: Number(evaluation.attitudeScoreV1),
    availabilityScore: Number(evaluation.availabilityScoreV1),
    textScore: Number(evaluation.textScoreV1),
    overallScore: Number(evaluation.overallScoreV1),
    tier: evaluation.tierV1,
  };
  const skills = evaluation.skillSnapshots.map((snapshot) => ({
    skillDefinitionId: snapshot.skillDefinitionId,
    skillCode: snapshot.skillCode,
    skillNameZh: snapshot.skillNameZh,
    skillNameEn: snapshot.skillNameEn,
    category: snapshot.category,
    skillMode: snapshot.skillMode,
    status: snapshot.status,
    statusFactor: Number(snapshot.statusFactor),
    weight: Number(snapshot.weight),
    contribution: Number(snapshot.contribution),
  }));
  const skillCategories = calculateSkillCategoryBreakdownV1(
    skills.map((skill) => ({
      id: skill.skillDefinitionId ?? skill.skillCode,
      weight: skill.weight,
      isActive: true,
      category: skill.category,
      skillMode: skill.skillMode,
    })),
    skills.map((skill) => ({
      skillDefinitionId: skill.skillDefinitionId ?? skill.skillCode,
      status: skill.status,
    })),
  );
  const categoryValues = Object.values(skillCategories);
  const confirmedWeight = categoryValues.reduce((sum, category) => sum + category.weightedMax, 0);
  const weightedRaw = categoryValues.reduce((sum, category) => sum + category.weightedRaw, 0);
  const confirmedCount = categoryValues.reduce((sum, category) => sum + category.confirmedCount, 0);
  const totalCount = categoryValues.reduce((sum, category) => sum + category.totalCount, 0);
  const skillRatio = confirmedCount === totalCount && confirmedWeight > 0
    ? Math.round((weightedRaw / confirmedWeight) * 10000) / 10000
    : null;
  return {
    id: evaluation.id,
    roundId: evaluation.roundId,
    employeeId: evaluation.employeeId,
    employeeName: evaluation.employeeNameSnapshot ?? evaluation.employee.displayName,
    storeId: evaluation.storeId,
    storeName: evaluation.storeNameSnapshot ?? evaluation.store.name,
    status: evaluation.evaluationStatus,
    scoringVersion: evaluation.scoringVersion,
    employeeTypeSnapshot: evaluation.employeeTypeSnapshot,
    round: evaluation.round ? {
      id: evaluation.round.id,
      status: evaluation.round.status,
      eligibleCount: evaluation.round.evaluators.length,
      completedCount: evaluation.round.evaluations.filter((item) =>
        item.evaluationStatus === "Submitted" || item.evaluationStatus === "Completed").length,
    } : null,
    policy,
    ratings: {
      speed: evaluation.speedRating,
      initiative: evaluation.initiativeRating,
      attitude: evaluation.attitudeRating,
      availability: evaluation.availabilityRating,
    },
    textFeedback: evaluation.textFeedback,
    textScoreSource: evaluation.textScoreSourceV1,
    scores,
    skillCoverage: evaluation.skillCoverageV1 == null ? null : Number(evaluation.skillCoverageV1),
    skillCategories,
    skill: {
      componentScore: skillRatio == null ? null : round1(skillRatio * policy.skillWeight),
      maxScore: policy.skillWeight,
      overallRatio: skillRatio,
      categories: skillCategories,
    },
    skills,
    ai: latestRun ? {
      runId: latestRun.id,
      status: latestRun.status,
      textScore: Number(latestRun.textScore),
      error: latestRun.errorMessage,
      evidence: latestRun.evidence,
    } : null,
    evaluatorId: evaluation.evaluatorId ?? evaluation.evaluatorAccountId ?? "",
    evaluatorNameSnapshot: evaluation.evaluatorNameSnapshot,
    createdAt: evaluation.createdAt.toISOString(),
    updatedAt: evaluation.updatedAt.toISOString(),
    submittedAt: evaluation.submittedAt?.toISOString() ?? null,
    completedAt: evaluation.completedAt?.toISOString() ?? null,
    version: evaluation.version,
  };
}

function withRoundProgress<T extends ReturnType<typeof toV1Dto>>(
  evaluation: T,
  round: { id: string; status: "OPEN" | "CLOSED"; completedCount: number; eligibleCount: number },
) {
  return {
    ...evaluation,
    round: {
      id: round.id,
      status: round.status,
      completedCount: round.completedCount,
      eligibleCount: round.eligibleCount,
    },
  };
}

function assertEvaluationReadAccess(
  evaluation: { evaluatorAccountId: string | null; storeId: string },
  actor?: AuthContext,
) {
  if (!actor || actor.role === "ADMIN") return;
  if (!actor.storeIds.includes(evaluation.storeId) || actor.accountId !== evaluation.evaluatorAccountId) {
    throw createHttpError(403, "You cannot view another evaluator's submission.");
  }
}

function toTextOutcomeDto(outcome: TextOutcome) {
  return {
    status: outcome.status,
    textScore: outcome.textScore,
    positiveEvidence: outcome.positiveEvidence,
    concernEvidence: outcome.concernEvidence,
    possibleSkillUpdates: outcome.possibleSkillUpdates,
    error: outcome.errorMessage,
  };
}

function isSkillStatus(value: string | null): value is SkillStatusV1 {
  return value != null && Object.hasOwn(skillStatusFactors, value);
}

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI text evaluation failed.";
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 500);
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
