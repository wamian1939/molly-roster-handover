import { Prisma, type PrismaClient } from "@prisma/client";
import { createHttpError } from "./httpError.js";
import type { storeMutationSchema, storeUpdateSchema } from "./validation.js";
import type { z } from "zod";

type StoreMutationPayload = z.infer<typeof storeMutationSchema>;
type StoreUpdatePayload = z.infer<typeof storeUpdateSchema>;

const storeCountSelect = {
  employees: true,
  evaluations: true,
};

export class StoreService {
  constructor(private readonly db: PrismaClient) {}

  async listStoresWithCounts(storeIds?: string[], includeArchived = false) {
    const rows = await this.db.store.findMany({
      where: {
        ...(storeIds ? { id: { in: storeIds } } : {}),
        ...(!includeArchived ? { isActive: true } : {}),
      },
      include: {
        _count: {
          select: storeCountSelect,
        },
        accountAccesses: {
          where: { account: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null } },
          select: { accountId: true },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      region: row.region,
      managerName: row.managerName,
      city: row.city,
      isActive: row.isActive,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      counts: {
        ...row._count,
        userAccounts: row.accountAccesses.length,
        activeEvaluatorAccounts: row.accountAccesses.length,
      },
    }));
  }

  async createStore(payload: StoreMutationPayload) {
    const existing = await this.db.store.findUnique({ where: { id: payload.id } });
    if (existing) throw createHttpError(409, "Store ID already exists.");

    return this.db.store.create({
      data: {
        ...payload,
        jobDefinitions: { create: [
          { name: "全岗", code: "full-role", colorToken: "teal", displayOrder: 10 },
          { name: "带训员", code: "trainer", colorToken: "violet", displayOrder: 20 },
        ] },
      },
    });
  }

  async updateStore(storeId: string, payload: StoreUpdatePayload) {
    const existing = await this.db.store.findUnique({ where: { id: storeId } });
    if (!existing) throw createHttpError(404, "Store does not exist.");
    if (Object.keys(payload).length === 0) return existing;

    return this.db.store.update({
      where: { id: storeId },
      data: payload,
    });
  }

  async archiveStore(storeId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.$transaction(async (tx) => {
          const existing = await tx.store.findUnique({ where: { id: storeId } });
          if (!existing) throw createHttpError(404, "门店不存在。");
          if (!existing.isActive) return existing;

          const archivedStore = await tx.store.update({
            where: { id: storeId },
            data: { isActive: false, archivedAt: new Date() },
          });
          const accesses = await tx.userAccountStoreAccess.findMany({
            where: { storeId },
            select: { accountId: true },
          });
          const accountIds = [...new Set(accesses.map((access) => access.accountId))];
          await tx.evaluation.deleteMany({
            where: { round: { storeId, status: "OPEN" } },
          });
          if (accountIds.length) {
            await tx.userAccountStoreAccess.deleteMany({ where: { storeId } });
            for (const accountId of accountIds) {
              const remainingAccess = await tx.userAccountStoreAccess.findFirst({
                where: { accountId, store: { isActive: true } },
                select: { storeId: true },
                orderBy: { assignedAt: "asc" },
              });
              if (!remainingAccess) await tx.userAccount.update({ where: { id: accountId }, data: { isActive: false } });
              if (!remainingAccess) await tx.authSession.deleteMany({ where: { userId: accountId } });
            }
          }

          return archivedStore;
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (!isSerializationConflict(error)) throw error;
        if (attempt === 2) throw createHttpError(409, "Store changed during archive. Refresh and retry.");
      }
    }
    throw new Error("Store archive retry loop ended unexpectedly.");
  }

  async reactivateStore(storeId: string) {
    const existing = await this.db.store.findUnique({ where: { id: storeId } });
    if (!existing) throw createHttpError(404, "门店不存在。");
    if (existing.isActive) return existing;
    return this.db.$transaction(async (tx) => {
      const store = await tx.store.update({ where: { id: storeId }, data: { isActive: true, archivedAt: null } });
      await Promise.all([
        tx.storeJobDefinition.upsert({ where: { storeId_name: { storeId, name: "全岗" } }, update: { isActive: true }, create: { storeId, name: "全岗", code: "full-role", colorToken: "teal", displayOrder: 10 } }),
        tx.storeJobDefinition.upsert({ where: { storeId_name: { storeId, name: "带训员" } }, update: { isActive: true }, create: { storeId, name: "带训员", code: "trainer", colorToken: "violet", displayOrder: 20 } }),
      ]);
      return store;
    });
  }

  async assertActiveStore(storeId: string) {
    const store = await this.db.store.findFirst({ where: { id: storeId, isActive: true }, select: { id: true } });
    if (!store) throw createHttpError(409, "该门店已归档，不能执行新的业务操作。");
  }
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001"));
}
