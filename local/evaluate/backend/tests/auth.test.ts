import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  canAccessStore,
  createRequireAuth,
  getAccessibleStoreScope,
  getAuthContext,
  isAdmin,
  requireStoreAccess,
  setSessionCookie,
  clearSessionCookie,
} from "../src/auth.js";

function requestWithHeaders(headers: Record<string, string | undefined>) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

describe("auth context", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("fails closed when no verified context has been attached", () => {
    expect(() => getAuthContext(requestWithHeaders({}) as never)).toThrow("请先登录");
  });

  it("does not trust forged development headers in production", async () => {
    process.env.NODE_ENV = "production";
    const authenticate = vi.fn().mockRejectedValue(new Error("登录状态已失效"));
    const middleware = createRequireAuth({ authenticate } as never);
    const request = requestWithHeaders({
      "x-user-id": "forged-user",
      "x-user-role": "ADMIN",
      "x-store-ids": "store-1",
    });
    const next = vi.fn();

    await middleware(request as never, {} as never, next);

    expect(authenticate).toHaveBeenCalledWith("");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "登录状态已失效" }));
    expect(() => getAuthContext(request as never)).toThrow("请先登录");
  });

  it("keeps test-only headers isolated to the test environment", async () => {
    process.env.NODE_ENV = "test";
    const authenticate = vi.fn();
    const middleware = createRequireAuth({ authenticate } as never);
    const request = requestWithHeaders({
      "x-user-id": "manager-1",
      "x-user-role": "StoreManager",
      "x-store-ids": "store-1",
    });
    const next = vi.fn();

    await middleware(request as never, {} as never, next);

    expect(authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(getAuthContext(request as never)).toMatchObject({
      userId: "manager-1",
      role: "STORE_EVALUATOR",
      storeIds: ["store-1"],
      canAccessAllStores: false,
    });
  });

  it("applies admin and single-store scope consistently", () => {
    const admin = { accountId: "admin", userId: "admin", username: "admin", displayName: "Admin", role: "ADMIN", storeIds: [], canAccessAllStores: true } as const;
    const manager = { accountId: "manager", userId: "manager", username: "manager", displayName: "Manager", role: "STORE_EVALUATOR", storeIds: ["store-1", "store-2"], canAccessAllStores: false } as const;

    expect(isAdmin(admin)).toBe(true);
    expect(canAccessStore(admin, "store-2")).toBe(true);
    expect(getAccessibleStoreScope(admin)).toBeUndefined();
    expect(canAccessStore(manager, "store-1")).toBe(true);
    expect(canAccessStore(manager, "store-2")).toBe(true);
    expect(canAccessStore(manager, "store-3")).toBe(false);
    expect(getAccessibleStoreScope(manager)).toEqual(["store-1", "store-2"]);
    expect(() => requireStoreAccess(manager, "store-3")).toThrow("无权访问该门店");
  });

  it("invalidates a store evaluator session when its Store is archived", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const db = {
      authSession: {
        findUnique: vi.fn(async () => ({
          id: "session-1",
          expiresAt: new Date(Date.now() + 60_000),
          user: {
            id: "manager-1",
            username: "manager",
            displayName: "Manager",
            role: "STORE_EVALUATOR",
            isActive: true,
            deletedAt: null,
            storeAccesses: [],
          },
        })),
        deleteMany,
      },
    };

    await expect(new AuthService(db as never).authenticate("token")).rejects.toMatchObject({ status: 401 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("invalidates every session for a logically deleted account", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const db = {
      authSession: {
        findUnique: vi.fn(async () => ({
          id: "session-deleted",
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: "deleted-1", username: "deleted", displayName: "Deleted", role: "STORE_EVALUATOR", isActive: false, deletedAt: new Date(), storeAccesses: [] },
        })),
        deleteMany,
      },
    };
    await expect(new AuthService(db as never).authenticate("token")).rejects.toMatchObject({ status: 401 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "session-deleted" } });
  });

  it("uses host-only secure Lax session cookies in production", () => {
    process.env.NODE_ENV = "production";
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const response = { cookie, clearCookie } as never;
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");

    setSessionCookie(response, "opaque-token", expiresAt);
    clearSessionCookie(response);

    expect(cookie).toHaveBeenCalledWith("evaluate_molly_session", "opaque-token", {
      httpOnly: true, sameSite: "lax", secure: true, expires: expiresAt, path: "/",
    });
    expect(clearCookie).toHaveBeenCalledWith("evaluate_molly_session", {
      httpOnly: true, sameSite: "lax", secure: true, path: "/",
    });
    expect(cookie.mock.calls[0]?.[2]).not.toHaveProperty("domain");
  });
});
