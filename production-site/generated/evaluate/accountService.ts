import { Prisma, type AccountRole, type PrismaClient } from "@prisma/client";
import { createAuthError, hashPassword, normalizeUsername } from "./auth.js";

export type CreateAccountInput = {
  username: string;
  displayName: string;
  password: string;
  role: AccountRole;
  storeIds?: string[];
};

export type UpdateAccountInput = {
  displayName?: string;
  role?: AccountRole;
  storeIds?: string[];
  isActive?: boolean;
};

const accountSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  storeAccesses: {
    select: { store: { select: { id: true, name: true, isActive: true } } },
    orderBy: { store: { name: "asc" as const } },
  },
} as const;

type SelectedAccount = Prisma.UserAccountGetPayload<{ select: typeof accountSelect }>;

export class AccountService {
  constructor(private readonly db: PrismaClient) {}

  async listAccounts(storeId?: string) {
    const rows = await this.db.userAccount.findMany({
      where: {
        deletedAt: null,
        ...(storeId ? { OR: [{ role: "ADMIN" }, { storeAccesses: { some: { storeId } } }] } : {}),
      },
      select: accountSelect,
      orderBy: [{ isActive: "desc" }, { username: "asc" }],
    });
    return rows.map(toAccountDto);
  }

  async createAccount(input: CreateAccountInput, actorAccountId: string) {
    const username = normalizeUsername(input.username);
    const storeIds = await this.validateRoleStores(input.role, input.storeIds ?? []);
    const passwordHash = await hashPassword(input.password);
    try {
      const account = await this.db.$transaction(async (tx) => {
        const created = await tx.userAccount.create({
          data: {
            username,
            displayName: input.displayName.trim(),
            passwordHash,
            role: input.role,
            storeAccesses: storeIds.length ? {
              create: storeIds.map((storeId) => ({ storeId, assignedByAccountId: actorAccountId })),
            } : undefined,
          },
          select: accountSelect,
        });
        await tx.authAuditEvent.create({
          data: {
            accountId: created.id,
            eventType: "ACCOUNT_CREATED",
            metadata: { actorAccountId, role: created.role, storeIds },
          },
        });
        return created;
      });
      return toAccountDto(account);
    } catch (error) {
      if (isUniqueViolation(error)) throw createAuthError(409, "用户名已存在");
      throw error;
    }
  }

  async updateAccount(accountId: string, input: UpdateAccountInput, actorAccountId: string) {
    const current = await this.db.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      include: { storeAccesses: { select: { storeId: true } } },
    });
    if (!current) throw createAuthError(404, "账号不存在");

    const role = input.role ?? current.role;
    const requestedStoreIds = role === "ADMIN"
      ? (input.storeIds ?? [])
      : (input.storeIds ?? current.storeAccesses.map((access) => access.storeId));
    const storeIds = await this.validateRoleStores(role, requestedStoreIds);
    const previousStoreIds = current.storeAccesses.map((access) => access.storeId);
    const removedStoreIds = previousStoreIds.filter((storeId) => !storeIds.includes(storeId));

    const account = await this.db.$transaction(async (tx) => {
      const remainsActiveAdmin = role === "ADMIN" && (input.isActive ?? current.isActive);
      if (current.role === "ADMIN" && current.isActive && !remainsActiveAdmin) {
        const activeAdmins = await tx.userAccount.count({
          where: { role: "ADMIN", isActive: true, deletedAt: null },
        });
        if (activeAdmins <= 1) throw createAuthError(409, "不能停用或降级最后一个有效总管理员");
      }

      if (removedStoreIds.length) await deleteOpenSubmissions(tx, accountId, removedStoreIds);
      if (role === "ADMIN") {
        await tx.userAccountStoreAccess.deleteMany({ where: { accountId } });
      } else {
        await tx.userAccountStoreAccess.deleteMany({ where: { accountId, storeId: { notIn: storeIds } } });
        const existingStoreIds = new Set(previousStoreIds);
        const addedStoreIds = storeIds.filter((storeId) => !existingStoreIds.has(storeId));
        if (addedStoreIds.length) {
          await tx.userAccountStoreAccess.createMany({
            data: addedStoreIds.map((storeId) => ({ accountId, storeId, assignedByAccountId: actorAccountId })),
            skipDuplicates: true,
          });
        }
      }

      const nextIsActive = input.isActive ?? current.isActive;
      const updated = await tx.userAccount.update({
        where: { id: accountId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          role,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: accountSelect,
      });

      if (!nextIsActive) {
        await tx.authSession.deleteMany({ where: { userId: accountId } });
        await deleteOpenSubmissions(tx, accountId);
        if (current.isActive) {
          await tx.authAuditEvent.create({
            data: { accountId, eventType: "ACCOUNT_DEACTIVATED", metadata: { actorAccountId } },
          });
        }
      }
      await tx.authAuditEvent.create({
        data: { accountId, eventType: "ACCOUNT_UPDATED", metadata: { actorAccountId, role, storeIds, isActive: nextIsActive } },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return toAccountDto(account);
  }

  async deleteAccount(accountId: string, actorAccountId: string) {
    if (accountId === actorAccountId) throw createAuthError(409, "不能删除当前正在使用的账号");
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delete-account:${accountId}`}))`;
      const target = await tx.userAccount.findFirst({ where: { id: accountId, deletedAt: null } });
      if (!target) throw createAuthError(404, "账号不存在或已删除");
      if (target.role === "ADMIN" && target.isActive) {
        const activeAdmins = await tx.userAccount.count({ where: { role: "ADMIN", isActive: true, deletedAt: null } });
        if (activeAdmins <= 1) throw createAuthError(409, "不能删除最后一个有效总管理员");
      }

      await tx.authSession.deleteMany({ where: { userId: accountId } });
      await deleteOpenSubmissions(tx, accountId);
      await tx.userAccountStoreAccess.deleteMany({ where: { accountId } });
      await tx.userAccount.update({
        where: { id: accountId },
        data: { isActive: false, deletedAt: new Date(), deletedByAccountId: actorAccountId },
      });
      await tx.authAuditEvent.create({ data: { accountId, eventType: "ACCOUNT_DELETED", metadata: { actorAccountId } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true } as const;
  }

  async resetPassword(accountId: string, password: string, actorAccountId: string) {
    const passwordHash = await hashPassword(password);
    return this.db.$transaction(async (tx) => {
      const updated = await tx.userAccount.updateMany({ where: { id: accountId, deletedAt: null }, data: { passwordHash } });
      if (updated.count !== 1) throw createAuthError(404, "账号不存在");
      await tx.authSession.deleteMany({ where: { userId: accountId } });
      await tx.authAuditEvent.create({ data: { accountId, eventType: "PASSWORD_RESET", metadata: { actorAccountId } } });
      return { ok: true } as const;
    });
  }

  private async validateRoleStores(role: AccountRole, inputStoreIds: string[]) {
    const storeIds = [...new Set(inputStoreIds.map((value) => value.trim()).filter(Boolean))];
    if (role === "ADMIN") {
      if (storeIds.length) throw createAuthError(400, "总管理员不需要指定门店权限");
      return [];
    }
    if (!storeIds.length) throw createAuthError(400, "门店评分账号必须至少选择一家门店");
    const activeStoreCount = await this.db.store.count({ where: { id: { in: storeIds }, isActive: true } });
    if (activeStoreCount !== storeIds.length) throw createAuthError(400, "所选门店不存在或已归档");
    return storeIds;
  }
}

function toAccountDto(account: SelectedAccount) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    stores: account.role === "ADMIN" ? [] : account.storeAccesses.map((access) => access.store),
    canAccessAllStores: account.role === "ADMIN",
    isActive: account.isActive,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

async function deleteOpenSubmissions(tx: Prisma.TransactionClient, evaluatorAccountId: string, storeIds?: string[]) {
  await tx.evaluation.deleteMany({
    where: {
      evaluatorAccountId,
      round: { status: "OPEN", ...(storeIds ? { storeId: { in: storeIds } } : {}) },
    },
  });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
