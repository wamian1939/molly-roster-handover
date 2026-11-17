import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const roundId = process.argv[2];

try {
  const store = await db.store.findFirst({ where: { name: { contains: "Hurstville", mode: "insensitive" } } });
  const activeStoreEvaluators = store
    ? await db.userAccount.count({ where: { storeId: store.id, role: "STORE_EVALUATOR", isActive: true } })
    : null;
  const liveSubmissions = await db.evaluation.count({ where: { evaluationStatus: "Submitted", round: { status: "OPEN" } } });
  const openMemberships = await db.evaluationRoundEvaluator.count({ where: { round: { status: "OPEN" } } });
  const openAdminSubmissions = await db.evaluation.count({
    where: { round: { status: "OPEN" }, evaluatorAccount: { role: "ADMIN" } },
  });
  const openGroups = await db.evaluationRound.groupBy({
    by: ["employeeId"],
    where: { status: "OPEN" },
    _count: { _all: true },
  });
  const selectedRoundRecord = roundId ? await db.evaluationRound.findUnique({
    where: { id: roundId },
    select: { status: true, scoringVersion: true, employeeTypeSnapshot: true, scoringPolicySnapshot: true, skillBaselineSnapshot: true },
  }) : null;
  const selectedRound = roundId ? {
    record: selectedRoundRecord,
    evaluationCount: await db.evaluation.count({ where: { roundId } }),
    adminSubmissionCount: await db.evaluation.count({ where: { roundId, evaluatorAccount: { role: "ADMIN" } } }),
  } : null;

  console.log(JSON.stringify({
    store: store ? { id: store.id, name: store.name } : null,
    activeStoreEvaluators,
    liveSubmissions,
    openMemberships,
    openAdminSubmissions,
    duplicateOpenEmployees: openGroups.filter((group) => group._count._all > 1).length,
    selectedRound,
  }));
} finally {
  await db.$disconnect();
}
