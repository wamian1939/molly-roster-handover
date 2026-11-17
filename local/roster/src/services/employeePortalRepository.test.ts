import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmployeePortalClient, type EmployeeWeek } from "./employeePortalRepository";

afterEach(() => vi.unstubAllGlobals());
const account = { id: "employee-a", name: "Employee A", storeId: "store-a", storeName: "Store A" };

describe("employee portal account adapter", () => {
  it("uses the formal session endpoint and never lists or impersonates demo accounts", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ account })));
    vi.stubGlobal("fetch", fetcher);
    const api = createEmployeePortalClient("account", "/staff/sign-in");
    expect(await api.me()).toEqual({ account });
    expect(fetcher).toHaveBeenCalledWith("/api/employee/me", expect.objectContaining({ credentials: "include", cache: "no-store" }));
    await expect(api.accounts()).rejects.toMatchObject({ status: 403 });
    await expect(api.login("someone-else")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps employee session expiry separate from manager authentication", async () => {
    const event = vi.fn();
    window.addEventListener("auth:unauthorized", event);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "expired" }), { status: 401 })));
    try {
      await expect(createEmployeePortalClient("account").me()).rejects.toMatchObject({ status: 401 });
      expect(event).not.toHaveBeenCalled();
    } finally { window.removeEventListener("auth:unauthorized", event); }
  });
  it("rejects unconfirmed identities, HTML responses and connection failures", async () => {
    const api = createEmployeePortalClient("account");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ account: { id: "wrong" } })))
      .mockResolvedValueOnce(new Response("<html>Login</html>"))
      .mockRejectedValueOnce(new TypeError("network"));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.me()).rejects.toMatchObject({ status: 0 });
    await expect(api.me()).rejects.toThrow("服务响应异常");
    await expect(api.me()).rejects.toMatchObject({ status: 0 });
  });
  it("allows only local login paths", () => {
    for (const path of ["https://elsewhere.test", "//elsewhere.test", "/\\elsewhere.test"]) expect(createEmployeePortalClient("account", path).signInPath).toBeUndefined();
    expect(createEmployeePortalClient("account", "/staff/login").signInPath).toBe("/staff/login");
  });
  it("preserves save concurrency fields and rejects malformed or wrong-week results", async () => {
    const week = "2026-11-16";
    const value: EmployeeWeek = { accountId: account.id, week, revision: 2, timezone: "Australia/Sydney", ruleVersion: "v1", ruleScope: "DEFAULT", updatedAt: null,
      days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${16 + i}`, status: "UNKNOWN", slots: [] })), capacity: [], shortcuts: [], shortcutsVersion: 1 };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...value, revision: 3 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...value, week: "2026-11-23" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetcher);
    const api = createEmployeePortalClient("account");
    await expect(api.save(value, value.days)).resolves.toMatchObject({ revision: 3 });
    expect(fetcher).toHaveBeenCalledWith("/api/employee/week", expect.objectContaining({ method: "PUT", body: JSON.stringify({ expectedAccountId: account.id, week, expectedRevision: 2, ruleVersion: "v1", days: value.days }) }));
    await expect(api.week(week)).rejects.toMatchObject({ status: 0 });
    await expect(api.week(week)).rejects.toMatchObject({ status: 0 });
  });
});
