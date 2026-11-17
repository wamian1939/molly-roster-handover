import { describe, expect, it, vi } from "vitest";
import { StoreService } from "../src/storeService.js";

function storeRow(overrides: Record<string, unknown> = {}) {
  return { id: "store-1", name: "Downtown", region: "Central", managerName: "Manager", city: "Sydney", isActive: true, archivedAt: null, ...overrides };
}

function createDb(row = storeRow(), accountIds: string[] = [], remainingStoreId: string | null = null) {
  const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
  const deleteOpenEvaluations = vi.fn(async () => ({ count: accountIds.length }));
  const deleteAccesses = vi.fn(async () => ({ count: accountIds.length }));
  const updateAccount = vi.fn(async () => ({}));
  const deleteSessions = vi.fn(async () => ({ count: 1 }));
  const tx = {
    store: { findUnique: vi.fn(async () => row), update },
    evaluation: { deleteMany: deleteOpenEvaluations },
    userAccountStoreAccess: {
      findMany: vi.fn(async () => accountIds.map((accountId) => ({ accountId }))),
      deleteMany: deleteAccesses,
      findFirst: vi.fn(async () => remainingStoreId ? { storeId: remainingStoreId } : null),
    },
    userAccount: { update: updateAccount },
    authSession: { deleteMany: deleteSessions },
    storeJobDefinition: { upsert: vi.fn(async () => ({})) },
  };
  return {
    store: { findUnique: tx.store.findUnique, findFirst: vi.fn(async () => row), update },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    update,
    deleteOpenEvaluations,
    deleteAccesses,
    updateAccount,
    deleteSessions,
  };
}

describe("StoreService", () => {
  it("counts active evaluator access relations once per Store", async () => {
    const findMany = vi.fn(async () => [{
      ...storeRow(),
      _count: { employees: 2, evaluations: 3 },
      accountAccesses: [{ accountId: "account-1" }, { accountId: "account-2" }],
    }]);
    const service = new StoreService({ store: { findMany } } as never);

    await expect(service.listStoresWithCounts()).resolves.toEqual([
      expect.objectContaining({ counts: { employees: 2, evaluations: 3, userAccounts: 2, activeEvaluatorAccounts: 2 } }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: { select: { employees: true, evaluations: true } },
        accountAccesses: expect.objectContaining({ where: { account: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null } } }),
      }),
    }));
  });

  it("archives a Store, removes only that access, and keeps a multi-store account active", async () => {
    const db = createDb(storeRow(), ["account-1"], "store-2");
    const service = new StoreService(db as never);

    await expect(service.archiveStore("store-1")).resolves.toMatchObject({ id: "store-1", isActive: false });
    expect(db.deleteOpenEvaluations).toHaveBeenCalledWith({ where: { round: { storeId: "store-1", status: "OPEN" } } });
    expect(db.deleteAccesses).toHaveBeenCalledWith({ where: { storeId: "store-1" } });
    expect(db.updateAccount).not.toHaveBeenCalled();
    expect(db.deleteSessions).not.toHaveBeenCalled();
  });

  it("automatically deactivates an evaluator that loses its last active Store", async () => {
    const db = createDb(storeRow(), ["account-1"], null);
    const service = new StoreService(db as never);
    await service.archiveStore("store-1");
    expect(db.updateAccount).toHaveBeenCalledWith({ where: { id: "account-1" }, data: { isActive: false } });
    expect(db.deleteSessions).toHaveBeenCalledWith({ where: { userId: "account-1" } });
  });

  it("removes OPEN submissions even when no evaluator access row exists", async () => {
    const db = createDb(storeRow(), []);
    await new StoreService(db as never).archiveStore("store-1");
    expect(db.deleteOpenEvaluations).toHaveBeenCalledWith({ where: { round: { storeId: "store-1", status: "OPEN" } } });
    expect(db.deleteAccesses).not.toHaveBeenCalled();
  });

  it("reactivates an archived store", async () => {
    const db = createDb(storeRow({ isActive: false, archivedAt: new Date() }));
    const service = new StoreService(db as never);
    await expect(service.reactivateStore("store-1")).resolves.toMatchObject({ isActive: true, archivedAt: null });
    expect(db.update).toHaveBeenCalledWith({ where: { id: "store-1" }, data: { isActive: true, archivedAt: null } });
  });
});
