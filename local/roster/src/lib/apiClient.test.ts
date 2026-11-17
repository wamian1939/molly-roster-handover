import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiRequestError, markAuthSessionChanged } from "./apiClient";

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
  it("ignores a late unauthorized response from the previous login session", async () => {
    let reply!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { reply = resolve; })));
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized);
    try {
      const pending = apiRequest("/roster/calendar");
      markAuthSessionChanged();
      reply(new Response(JSON.stringify({ message: "Expired" }), { status: 401 }));
      await expect(pending).rejects.toMatchObject({ status: 401 });
      expect(unauthorized).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("auth:unauthorized", unauthorized);
    }
  });
  it("uses the same-origin API and includes credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.objectContaining({ credentials: "include" }));
  });

  it("turns transport failures into localized errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret transport detail"); }));
    await expect(apiRequest("/health")).rejects.toEqual(new ApiRequestError("无法连接排班服务器，请稍后重试。", 0));
  });

  it("retains structured validation details from a conflict response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Conflict", validation: { code: "SHIFT_OVERLAP", severity: "BLOCKING_ERROR", message: "Conflict", employeeId: "employee-1" } }), { status: 409, headers: { "content-type": "application/json" } })));
    await expect(apiRequest("/roster/shifts/one")).rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_OVERLAP", employeeId: "employee-1" } });
  });

  it("identifies a timeout as unconfirmed rather than claiming a save failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    await expect(apiRequest("/roster/shifts/one", { method: "PATCH" })).rejects.toMatchObject({ status: 0, message: expect.stringContaining("未确认") });
  });

  it("keeps a disconnected mutation outcome explicitly uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connection reset"); }));
    await expect(apiRequest("/roster/batch/copy-day", { method: "POST" })).rejects.toMatchObject({ status: 0, message: expect.stringContaining("未确认") });
  });

  it("treats malformed success JSON after a mutation as an unconfirmed save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{broken", { status: 200, headers: { "content-type": "application/json" } })));
    await expect(apiRequest("/roster/shifts/one", { method: "PATCH" })).rejects.toMatchObject({
      status: 0, message: expect.stringContaining("尚未确认"),
    });
  });

  it("reports malformed success JSON from a read as a response failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{broken", { status: 200, headers: { "content-type": "application/json" } })));
    await expect(apiRequest("/roster/calendar", { method: "GET" })).rejects.toMatchObject({
      status: 200, message: expect.stringContaining("响应未能完整读取"),
    });
  });
});

