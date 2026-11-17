import { Prisma, type PrismaClient } from "@prisma/client";
import { computeRoundAggregate, roundAggregateInclude } from "./evaluationRoundService.js";

export async function loadRoundAggregates(
  db: PrismaClient,
  options: { employeeIds?: string[]; storeIds?: string[]; includeOpen?: boolean } = {},
) {
  if (options.employeeIds?.length === 0 || options.storeIds?.length === 0) return [];
  const rounds = await db.evaluationRound.findMany({
    where: {
      ...(options.employeeIds ? { employeeId: { in: options.employeeIds } } : {}),
      ...(options.storeIds ? { storeId: { in: options.storeIds } } : {}),
      ...(!options.includeOpen ? { status: "CLOSED" as const } : {}),
      evaluations: { some: { evaluationStatus: { in: ["Submitted", "Completed"] }, overallScoreV1: { not: null } } },
    },
    include: roundAggregateInclude,
    orderBy: [{ employeeId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const openStoreIds = [...new Set(rounds.filter((round) => round.status === "OPEN").map((round) => round.storeId))];
  const accountModel = (db as PrismaClient & { userAccount?: PrismaClient["userAccount"] }).userAccount;
  const liveAccounts = openStoreIds.length && accountModel ? await accountModel.findMany({
    where: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null, storeAccesses: { some: { storeId: { in: openStoreIds } } } },
    select: { id: true, displayName: true, storeAccesses: { where: { storeId: { in: openStoreIds } }, select: { storeId: true } } },
  }) : [];
  const liveAccountsByStore = new Map<string, typeof liveAccounts>();
  for (const account of liveAccounts) {
    for (const access of account.storeAccesses) {
      const accounts = liveAccountsByStore.get(access.storeId) ?? [];
      accounts.push(account);
      liveAccountsByStore.set(access.storeId, accounts);
    }
  }
  return rounds.map((round) => computeRoundAggregate(
    round,
    false,
    round.status === "OPEN" ? (liveAccountsByStore.get(round.storeId) ?? []) : undefined,
  ));
}

// Current-score surfaces need one valid CLOSED result per canonical employee.
// Legacy CLOSED rounds may lack a persisted aggregate, so eligibility must
// include their frozen evaluator memberships rather than trusting a personal
// ADMIN submission or merely taking the newest CLOSED row.
export async function loadLatestValidClosedAggregates(db: PrismaClient, employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  const ids = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT latest."id"
    FROM (VALUES ${Prisma.join(employeeIds.map((id) => Prisma.sql`(${id})`))}) AS requested("employeeId")
    CROSS JOIN LATERAL (
      SELECT r."id"
      FROM "evaluation_rounds" r
      WHERE r."employeeId" = requested."employeeId"
        AND r."status" = 'CLOSED'
        AND EXISTS (
          SELECT 1 FROM "evaluations" any_score
          WHERE any_score."roundId" = r."id"
            AND any_score."evaluationStatus" IN ('Submitted', 'Completed')
            AND any_score."overallScoreV1" IS NOT NULL
        )
        AND (
          r."finalAggregateOverall" IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM "evaluations" personal
            JOIN "evaluation_round_evaluators" membership
              ON membership."roundId" = r."id"
             AND membership."evaluatorAccountId" = personal."evaluatorAccountId"
             AND membership."excludedAt" IS NULL
            WHERE personal."roundId" = r."id"
              AND personal."evaluationStatus" = 'Completed'
          )
        )
      ORDER BY r."createdAt" DESC, r."id" DESC
      LIMIT 1
    ) latest
  `);
  if (ids.length === 0) return [];
  const rounds = await db.evaluationRound.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: roundAggregateInclude,
  });
  return rounds.map((round) => computeRoundAggregate(round, false));
}

export function latestAggregateByEmployee<T extends { employee: { id: string }; aggregateOverall: number | null }>(rounds: T[]) {
  const map = new Map<string, T>();
  for (const round of rounds) {
    if (round.aggregateOverall != null && !map.has(round.employee.id)) map.set(round.employee.id, round);
  }
  return map;
}
