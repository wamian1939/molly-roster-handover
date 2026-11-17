import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { AccountService } from "../src/accountService.js";
import { hashPassword, normalizeUsername, verifyPassword } from "../src/auth.js";

describe("account security", () => {
  it("writes new passwords with Argon2id and verifies legacy bcrypt hashes", async () => {
    const argonHash = await hashPassword("molly1234");
    const bcryptHash = await bcrypt.hash("legacy123", 4);

    expect(argonHash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(argonHash, "molly1234")).resolves.toBe(true);
    await expect(verifyPassword(bcryptHash, "legacy123")).resolves.toBe(true);
    await expect(verifyPassword(bcryptHash, "wrong-password")).resolves.toBe(false);
    expect(normalizeUsername("  Hurstville01 ")).toBe("hurstville01");
  });

  it("prevents deactivating the final active ADMIN", async () => {
    const current = { ...account({ role: "ADMIN", isActive: true }), storeAccesses: [] };
    const tx = {
      userAccount: {
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
      },
      userAccountStoreAccess: { deleteMany: vi.fn(), createMany: vi.fn() },
      evaluation: { deleteMany: vi.fn() },
      authSession: { deleteMany: vi.fn() },
      authAuditEvent: { create: vi.fn() },
    };
    const db = {
      userAccount: { findFirst: vi.fn().mockResolvedValue(current) },
      store: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const service = new AccountService(db as never);

    await expect(service.updateAccount(current.id, { isActive: false }, "actor-admin"))
      .rejects.toThrow("不能停用或降级最后一个有效总管理员");
    expect(tx.userAccount.update).not.toHaveBeenCalled();
  });

  it("requires at least one active Store for a STORE_EVALUATOR", async () => {
    const service = new AccountService({ store: { count: vi.fn() } } as never);
    await expect(service.createAccount({ username: "multi", displayName: "Multi", password: "password1", role: "STORE_EVALUATOR", storeIds: [] }, "admin-1"))
      .rejects.toThrow("至少选择一家门店");
  });

  it("rejects explicit Store assignments for ADMIN", async () => {
    const service = new AccountService({ store: { count: vi.fn() } } as never);
    await expect(service.createAccount({ username: "admin2", displayName: "Admin 2", password: "password1", role: "ADMIN", storeIds: ["store-1"] }, "admin-1"))
      .rejects.toThrow("总管理员不需要指定门店权限");
  });

  it("prevents self deletion before changing any data", async () => {
    const service = new AccountService({} as never);
    await expect(service.deleteAccount("admin-1", "admin-1")).rejects.toThrow("不能删除当前正在使用的账号");
  });

  it("revokes sessions and audits password reset", async () => {
    const tx = {
      userAccount: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      authSession: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      authAuditEvent: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const db = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const service = new AccountService(db as never);
    await expect(service.resetPassword("account-1", "newpass123", "actor-admin")).resolves.toEqual({ ok: true });

    expect(tx.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "account-1" } });
    expect(tx.authAuditEvent.create).toHaveBeenCalledWith({
      data: { accountId: "account-1", eventType: "PASSWORD_RESET", metadata: { actorAccountId: "actor-admin" } },
    });
    const passwordHash = tx.userAccount.updateMany.mock.calls[0]?.[0]?.data.passwordHash;
    expect(passwordHash).toMatch(/^\$argon2id\$/);
  });
});

function account(overrides: Partial<ReturnType<typeof baseAccount>> = {}) {
  return { ...baseAccount(), ...overrides };
}

function baseAccount() {
  return {
    id: "admin-1",
    username: "admin",
    displayName: "Admin",
    passwordHash: "hash",
    role: "ADMIN" as const,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
