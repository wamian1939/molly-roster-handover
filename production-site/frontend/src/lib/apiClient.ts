import type { SchedulingIssue } from "./schedulingFeedback";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
let authSessionRevision = 0;
export function markAuthSessionChanged() { authSessionRevision += 1; }
export function apiHref(path: string) { return `${API_BASE_URL}${path}`; }

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly validation?: SchedulingIssue) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const requestAuthRevision = authSessionRevision;
  const mutation = Boolean(init?.method && !["GET", "HEAD"].includes(init.method.toUpperCase()));
  let response: Response;
  try {
    response = await fetch(apiHref(path), {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    const timeout = typeof cause === "object" && cause !== null && "name" in cause && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw new ApiRequestError(mutation
      ? timeout ? "请求超时，保存结果尚未确认；请检查日历后再重试。" : "连接中断，保存结果尚未确认；请检查日历后再重试。"
      : timeout ? "请求超时，请稍后重试。" : "无法连接排班服务器，请稍后重试。", 0);
  }

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    let validation: SchedulingIssue | undefined;
    try {
      const body = await response.json() as { message?: string; issues?: Array<{ message?: string }>; validation?: SchedulingIssue };
      message = body.issues?.find((issue) => issue.message)?.message ?? body.message ?? message;
      validation = body.validation;
    } catch {
      // Keep localized generic text for non-JSON failures.
    }
    if (response.status === 401 && requestAuthRevision === authSessionRevision && typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    throw new ApiRequestError(message, response.status, validation);
  }

  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new ApiRequestError(mutation
      ? "服务器响应未能完整读取，保存结果尚未确认；请检查日历后再重试。"
      : "服务器响应未能完整读取，请刷新后重试。", mutation ? 0 : response.status);
  }
}

