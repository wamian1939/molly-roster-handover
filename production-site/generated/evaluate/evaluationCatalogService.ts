import type { PrismaClient } from "@prisma/client";

type StoreScope = string[] | undefined;

export class EvaluationCatalogService {
  constructor(private readonly db: PrismaClient) {}

  listPeriods() {
    return this.db.evaluation
      .findMany({
        distinct: ["evaluationPeriod"],
        orderBy: { evaluationPeriod: "desc" },
        select: { evaluationPeriod: true },
      })
      .then((rows) => rows.flatMap((row) => row.evaluationPeriod ? [row.evaluationPeriod] : []));
  }

  listStores(storeIds?: StoreScope) {
    return this.db.store.findMany({
      where: { isActive: true, ...(storeIds ? { id: { in: storeIds } } : {}) },
      orderBy: { name: "asc" },
    });
  }
}
