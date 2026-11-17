import { z } from "zod";
import { HttpError } from "./httpError.js";
import type { AuthUser } from "./types.js";

type FetchLike = typeof fetch;

const authUserSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["ADMIN", "STORE_EVALUATOR"]),
  storeIds: z.array(z.string().min(1)),
  stores: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
  canAccessAllStores: z.boolean(),
}).superRefine((user, context) => {
  const listed = user.stores.map((store) => store.id);
  if (user.id !== user.accountId || user.userId !== user.accountId
    || user.canAccessAllStores !== (user.role === "ADMIN")
    || (user.role === "STORE_EVALUATOR" && user.storeIds.length === 0)
    || new Set(user.storeIds).size !== user.storeIds.length
    || new Set(listed).size !== listed.length
    || listed.length !== user.storeIds.length
    || listed.some((id) => !user.storeIds.includes(id))) {
    context.addIssue({ code: "custom", message: "Evaluate auth identity or store scope is inconsistent" });
  }
});

export function verifiedAuthUser(value: unknown): AuthUser {
  const parsed = authUserSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(503, "Evaluate Molly 登录资料格式不正确");
  return parsed.data;
}

export class EvaluateClient {
  private readonly baseUrl: string;
  private readonly appOrigin: string;

  constructor(baseUrl = process.env.EVALUATE_API_BASE_URL ?? "http://127.0.0.1:4000/api", private readonly fetchImpl: FetchLike = fetch, private readonly timeoutMs = 5_000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.appOrigin = new URL(process.env.EVALUATE_APP_ORIGIN?.trim() || this.baseUrl).origin;
  }

  login(body: unknown) {
    return this.request("/auth/login", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: this.appOrigin } });
  }

  logout(cookie: string | undefined) {
    const sessionCookie = forwardedSessionCookie(cookie);
    return this.request("/auth/logout", { method: "POST", headers: { origin: this.appOrigin, ...(sessionCookie ? { cookie: sessionCookie } : {}) } });
  }

  async me(cookie: string | undefined): Promise<AuthUser> {
    const sessionCookie = forwardedSessionCookie(cookie);
    if (!sessionCookie) throw new HttpError(401, "请先登录");
    const response = await this.request("/auth/me", { headers: { cookie: sessionCookie } });
    const body = await readJson<{ user?: unknown; message?: string }>(response);
    if (!response.ok) throw new HttpError(response.status, body?.message ?? "登录状态已失效");
    return verifiedAuthUser(body?.user);
  }

  async health() {
    const response = await this.request("/health");
    if (!response.ok) return false;
    try {
      const body: unknown = await response.json();
      return typeof body === "object" && body !== null && "ok" in body && body.ok === true;
    } catch {
      return false;
    }
  }

  integration(path: string, cookie: string) {
    const sessionCookie = forwardedSessionCookie(cookie);
    if (!sessionCookie) throw new HttpError(401, "请先登录");
    return this.request(`/roster-integration${path}`, { headers: { cookie: sessionCookie } });
  }

  storeJobs(storeId: string, cookie: string) {
    const sessionCookie = forwardedSessionCookie(cookie);
    if (!sessionCookie) throw new HttpError(401, "请先登录");
    return this.request(`/store-jobs?storeId=${encodeURIComponent(storeId)}`, { headers: { cookie: sessionCookie } });
  }

  private async request(path: string, init: RequestInit = {}) {
    try {
      // Keep the signal active through response.json(), including a body that stalls after headers.
      return await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new HttpError(503, "Evaluate Molly 暂时无法连接");
    }
  }
}

function forwardedSessionCookie(cookieHeader: string | undefined) {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith("evaluate_molly_session=") && part.length > "evaluate_molly_session=".length);
}

export async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch {
    if (response.ok) throw new HttpError(503, "Evaluate Molly 返回的数据无法读取");
    return {} as T;
  }
}

export function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
}

