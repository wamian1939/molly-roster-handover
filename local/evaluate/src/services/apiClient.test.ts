// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./apiClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiClient authentication contract", () => {
  it("always sends the HttpOnly session cookie and never injects auth headers", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest<{ ok: true }>("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/auth/me", expect.objectContaining({
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }));
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toMatch(/x-user-role|x-store-ids|x-user-id/i);
  });

  it("emits an unauthenticated event on 401 and does not return fallback data", async () => {
    const listener = vi.fn();
    window.addEventListener("auth:unauthorized", listener);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "登录状态已失效" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(apiRequest("/employees")).rejects.toThrow("登录状态已失效");
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("auth:unauthorized", listener);
  });
});
