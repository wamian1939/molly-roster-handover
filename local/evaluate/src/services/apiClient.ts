const API_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000/api")
  : "/api";

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("无法连接服务器，请稍后重试。", 0);
  }

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = await response.json() as { message?: string; error?: string; issues?: Array<{ message?: string }> };
      message = body.issues?.find((issue) => issue.message)?.message ?? body.message ?? body.error ?? message;
    } catch {
      // Keep the generic message when the server does not return JSON.
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    if (response.status === 403 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:forbidden"));
    }
    throw new ApiRequestError(message, response.status);
  }

  return response.json() as Promise<T>;
}
