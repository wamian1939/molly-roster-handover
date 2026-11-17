export type EmployeeAccount = { id: string; name: string; storeId: string; storeName: string };
export type DemoEmployee = EmployeeAccount;
export type AvailabilityDay = { date: string; status: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN"; shortcut?: string; slots: Array<{ start: string; end: string }> };
export type CapacityBand = { start: string; end: string; signal: "GREEN" | "YELLOW" | "RED" };
export type EmployeeWeek = {
  accountId: string; week: string; timezone: string; ruleVersion: string; ruleScope: "DEFAULT" | "WEEK";
  revision: number; updatedAt: string | null; days: AvailabilityDay[];
  capacity: Array<{ date: string; bands: CapacityBand[] }>;
  shortcuts: Array<{ code: string; startTime: string; endTime: string }>; shortcutsVersion: number;
};

export type EmployeePortalClient = {
  mode: "demo" | "account";
  signInPath?: string;
  accounts: () => Promise<{ accounts: EmployeeAccount[] }>;
  me: () => Promise<{ account: EmployeeAccount }>;
  login: (accountId: string) => Promise<{ account: EmployeeAccount }>;
  logout: () => Promise<unknown>;
  week: (week: string) => Promise<EmployeeWeek>;
  preview: (accountId: string, week: string, script: string) => Promise<EmployeeWeek>;
  save: (value: EmployeeWeek, days: AvailabilityDay[]) => Promise<EmployeeWeek>;
};

export class EmployeePortalError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "EmployeePortalError"; }
}

function checkedWeek(value: EmployeeWeek, expectedWeek: string) {
  const time = (v: string) => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const expectedDates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${expectedWeek}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  const valid = value && value.week === expectedWeek && typeof value.accountId === "string" && value.accountId.length > 0
    && typeof value.timezone === "string" && typeof value.ruleVersion === "string" && value.ruleVersion.length > 0
    && Number.isInteger(value.revision) && value.revision >= 0
    && Array.isArray(value.days) && value.days.length === 7 && value.days.every((day, index) => day && day.date === expectedDates[index]
      && ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].includes(day.status) && Array.isArray(day.slots)
      && day.slots.every(slot => slot && time(slot.start) && time(slot.end)))
    && Array.isArray(value.shortcuts) && value.shortcuts.every(s => s && typeof s.code === "string" && time(s.startTime) && time(s.endTime))
    && Array.isArray(value.capacity) && value.capacity.every(day => day && expectedDates.includes(day.date) && Array.isArray(day.bands)
      && day.bands.every(band => band && time(band.start) && time(band.end) && ["GREEN", "YELLOW", "RED"].includes(band.signal)));
  if (!valid) throw new EmployeePortalError("报班结果尚未确认，请重新读取核对", 0);
  return value;
}

// Employee sessions stay separate from manager sessions. No global auth events.
export function createEmployeePortalClient(mode: "demo" | "account", signInPath?: string): EmployeePortalClient {
  const base = mode === "demo" ? "/api/employee-demo" : "/api/employee";
  async function request<T>(path: string, body?: unknown, method = "GET"): Promise<T> {
    let response: Response;
    try { response = await fetch(`${base}${path}`, {
      method, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }); } catch { throw new EmployeePortalError("连接中断，请稍后重试", 0); }
    let value;
    try { value = await response.json(); } catch { throw new EmployeePortalError("服务响应异常，请稍后重新读取", response.status); }
    if (!response.ok) throw new EmployeePortalError(response.status === 401 ? "员工登录已过期，请重新登录后继续" : value?.message || "报班请求失败，请稍后重试", response.status);
    return value as T;
  }
  const identity = async (path: string, body?: unknown, method = "GET") => {
    const value = await request<{ account: EmployeeAccount }>(path, body, method);
    if (!value?.account || [value.account.id, value.account.name, value.account.storeId, value.account.storeName].some(v => typeof v !== "string" || !v.trim())) {
      throw new EmployeePortalError("员工身份暂时无法确认，请重新登录", 0);
    }
    return value;
  };
  const demoOnly = () => { if (mode !== "demo") throw new EmployeePortalError("请使用正式员工账号登录", 403); };

  return {
    mode, signInPath: signInPath?.startsWith("/") && !signInPath.startsWith("//") && !/[\\\r\n]/.test(signInPath) ? signInPath : undefined,
    accounts: async () => { demoOnly(); return request<{ accounts: EmployeeAccount[] }>("/accounts"); },
    me: () => identity("/me"),
    login: async (accountId: string) => { demoOnly(); return identity("/login", { accountId }, "POST"); },
    logout: () => request("/logout", {}, "POST"),
    week: async (week: string) => checkedWeek(await request<EmployeeWeek>(`/week?week=${encodeURIComponent(week)}`), week),
    preview: async (accountId: string, week: string, script: string) => checkedWeek(await request<EmployeeWeek>("/preview", { expectedAccountId: accountId, week, script }, "POST"), week),
    save: async (value: EmployeeWeek, days: AvailabilityDay[]) => checkedWeek(await request<EmployeeWeek>("/week", {
      expectedAccountId: value.accountId, week: value.week, expectedRevision: value.revision, ruleVersion: value.ruleVersion, days,
    }, "PUT"), value.week),
  };
}

// Formal mode never falls back to demo identities if authentication fails.
export const employeePortalRepository = createEmployeePortalClient(
  "demo",
  import.meta.env.VITE_EMPLOYEE_SIGN_IN_PATH,
);
