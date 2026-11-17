import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const [accounts, stores, openRoundSubmissions, closedHistoryReferences] = await Promise.all([
    db.userAccount.findMany({
      select: { username: true, role: true, isActive: true, deletedAt: true, storeAccesses: { select: { storeId: true, store: { select: { isActive: true } } } } },
      orderBy: { username: "asc" },
    }),
    db.store.findMany({ select: { id: true, name: true, isActive: true } }),
    db.evaluation.count({ where: { round: { status: "OPEN" }, evaluationStatus: "Submitted" } }),
    db.evaluation.count({ where: { round: { status: "CLOSED" } } }),
  ]);
  console.log(JSON.stringify({
    adminCount: accounts.filter((account) => account.role === "ADMIN").length,
    activeAdminCount: accounts.filter((account) => account.role === "ADMIN" && account.isActive).length,
    storeEvaluatorCount: accounts.filter((account) => account.role === "STORE_EVALUATOR").length,
    accounts: accounts.map((account) => ({
      username: account.username,
      role: account.role,
      storeIds: account.storeAccesses.map((access) => access.storeId),
      isActive: account.isActive,
      deleted: account.deletedAt != null,
    })),
    archivedStoreRelations: accounts
      .filter((account) => account.storeAccesses.some((access) => !access.store.isActive))
      .map((account) => account.username),
    evaluatorsWithoutAccess: accounts
      .filter((account) => account.role === "STORE_EVALUATOR" && account.isActive && !account.deletedAt && account.storeAccesses.length === 0)
      .map((account) => account.username),
    openRoundSubmissions,
    closedHistoryReferences,
  }, null, 2));
} finally {
  await db.$disconnect();
}
