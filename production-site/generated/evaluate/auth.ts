import {runtimeEnv} from '../../server/runtime-env.mjs';
import {authenticateSiteSession} from '../../server/evaluate-auth.mjs';
import { createHash, randomBytes } from "node:crypto";
import { Algorithm, hash as hashArgon2, verify as verifyArgon2 } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import type { Request, RequestHandler, Response } from "express";
import type { PrismaClient } from "@prisma/client";

export type AuthRole = "ADMIN" | "STORE_EVALUATOR";

export type AuthContext = {
  accountId: string;
  userId: string;
  username: string;
  displayName: string;
  role: AuthRole;
  storeIds: string[];
  canAccessAllStores: boolean;
};

export type AuthUser = AuthContext & {
  id: string;
  stores: Array<{ id: string; name: string }>;
};

const accountAuthInclude = {
  storeAccesses: {
    where: { store: { isActive: true } },
    select: { store: { select: { id: true, name: true } } },
    orderBy: { store: { name: "asc" as const } },
  },
} as const;

export const SESSION_COOKIE_NAME = "evaluate_molly_session";
const authContexts = new WeakMap<Request, AuthUser>();

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  async login(usernameInput: string, password: string) {
    const username = normalizeUsername(usernameInput);
    const account = await this.db.userAccount.findUnique({
      where: { username },
      include: accountAuthInclude,
    });

    const passwordMatches = account ? await verifyPassword(account.passwordHash, password) : false;
    if (!account || account.deletedAt || !account.isActive || !passwordMatches ||
      (account.role === "STORE_EVALUATOR" && account.storeAccesses.length === 0)) {
      await this.writeAudit(account?.id ?? null, "LOGIN_FAILURE", { username }).catch(() => undefined);
      throw createAuthError(401, "用户名或密码错误");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionDurationMs());
    const upgradedPasswordHash = isArgon2Hash(account.passwordHash) ? undefined : await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await tx.authSession.create({
        data: { userId: account.id, tokenHash: hashSessionToken(token), expiresAt },
      });
      await tx.userAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date(), ...(upgradedPasswordHash ? { passwordHash: upgradedPasswordHash } : {}) },
      });
      await tx.authAuditEvent.create({
        data: { accountId: account.id, eventType: "LOGIN_SUCCESS" },
      });
    });

    return { token, expiresAt, user: toAuthUser(account) };
  }

  async authenticate(token: string): Promise<AuthUser> { return authenticateSiteSession(this.db, token); }

  async logout(token: string | undefined) {
    if (!token) return;
    const tokenHash = hashSessionToken(token);
    const session = await this.db.authSession.findUnique({ where: { tokenHash }, select: { userId: true } });
    await this.db.$transaction(async (tx) => {
      await tx.authSession.deleteMany({ where: { tokenHash } });
      if (session) {
        await tx.authAuditEvent.create({ data: { accountId: session.userId, eventType: "LOGOUT" } });
      }
    });
  }

  private writeAudit(accountId: string | null, eventType: "LOGIN_FAILURE", metadata?: Record<string, string>) {
    return this.db.authAuditEvent.create({ data: { accountId, eventType, metadata } });
  }
}

export function createRequireAuth(authService: AuthService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const testAuth = readTestAuth(request);
      const user = testAuth ?? await authService.authenticate(readSessionToken(request) ?? "");
      authContexts.set(request, user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getAuthContext(request: Request): AuthUser {
  const auth = authContexts.get(request);
  if (!auth) throw createAuthError(401, "请先登录");
  return auth;
}

export function readSessionToken(request: Request) {
  const cookieHeader = request.header("cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: runtimeEnv.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: runtimeEnv.NODE_ENV === "production",
    path: "/",
  });
}

export function isAdmin(auth: AuthContext) {
  return auth.role === "ADMIN";
}

export function canAccessStore(auth: AuthContext, storeId: string) {
  return auth.canAccessAllStores || auth.storeIds.includes(storeId);
}

export function requireStoreAccess(auth: AuthContext, storeId: string) {
  if (!canAccessStore(auth, storeId)) throw createAuthError(403, "无权访问该门店");
}

export function requireAdmin(auth: AuthContext) {
  if (!isAdmin(auth)) throw createAuthError(403, "仅管理员可以执行此操作");
}

export function getAccessibleStoreScope(auth: AuthContext) {
  return auth.canAccessAllStores ? undefined : auth.storeIds;
}

export function createAuthError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return hashArgon2(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  if (isArgon2Hash(passwordHash)) return verifyArgon2(passwordHash, password);
  if (passwordHash.startsWith("$2")) return bcrypt.compare(password, passwordHash);
  return false;
}

function isArgon2Hash(passwordHash: string) {
  return passwordHash.startsWith("$argon2id$");
}

function sessionDurationMs() {
  const configuredDays = Number(runtimeEnv.AUTH_SESSION_DAYS ?? "7");
  const days = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 7;
  return days * 24 * 60 * 60 * 1000;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthUser(account: {
  id: string;
  username: string;
  displayName: string;
  role: AuthRole;
  storeAccesses: Array<{ store: { id: string; name: string } }>;
}): AuthUser {
  const stores = account.role === "ADMIN" ? [] : account.storeAccesses.map((access) => access.store);
  return {
    id: account.id,
    accountId: account.id,
    userId: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    stores,
    storeIds: stores.map((store) => store.id),
    canAccessAllStores: account.role === "ADMIN",
  };
}

function readTestAuth(request: Request): AuthUser | null {
  if (runtimeEnv.NODE_ENV !== "test") return null;
  const legacyRole = request.header("x-user-role");
  const storeIds = request.header("x-store-ids")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (!legacyRole) {
    return { id: "test-admin", accountId: "test-admin", userId: "test-admin", username: "test-admin", displayName: "Test Admin", role: "ADMIN", storeIds: [], stores: [], canAccessAllStores: true };
  }
  const role: AuthRole = legacyRole === "Admin" || legacyRole === "ADMIN" ? "ADMIN" : "STORE_EVALUATOR";
  const userId = request.header("x-user-id") ?? "test-user";
  return {
    id: userId,
    accountId: userId,
    userId,
    username: userId,
    displayName: userId,
    role,
    storeIds: role === "ADMIN" ? [] : storeIds,
    stores: role === "ADMIN" ? [] : storeIds.map((id) => ({ id, name: id })),
    canAccessAllStores: role === "ADMIN",
  };
}
