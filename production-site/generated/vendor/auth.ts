import type { NextFunction, Request, Response } from "express";
import { EvaluateClient } from "./evaluateClient.js";
import { HttpError } from "./httpError.js";
import type { AuthUser } from "./types.js";

const authContexts = new WeakMap<Request, AuthUser>();

export function requireEvaluateAuth(client: EvaluateClient) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      if (process.env.NODE_ENV === "test" && request.header("x-test-user-role")) {
        const role = request.header("x-test-user-role") === "ADMIN" ? "ADMIN" : "STORE_EVALUATOR";
        const storeIds = role === "ADMIN" ? [] : (request.header("x-test-store-ids")?.split(",") ?? [request.header("x-test-store-id") ?? ""]).filter(Boolean);
        authContexts.set(request, { id: "test-user", accountId: "test-user", userId: "test-user", username: "test-user", displayName: "Test User", role, storeIds, stores: storeIds.map((id) => ({ id, name: id })), canAccessAllStores: role === "ADMIN" });
      } else {
        authContexts.set(request, await client.me(request.header("cookie")));
      }
      next();
    } catch (error) { next(error); }
  };
}

export function getAuth(request: Request) {
  const auth = authContexts.get(request);
  if (!auth) throw new HttpError(401, "请先登录");
  return auth;
}

export function requireStore(auth: AuthUser, storeId: string) {
  if (auth.role !== "ADMIN" && !auth.storeIds.includes(storeId)) throw new HttpError(403, "无权访问该门店");
}

export function requireAdmin(auth: AuthUser) {
  if (auth.role !== "ADMIN") throw new HttpError(403, "仅管理员可以执行此操作");
}

