import { PayrollError, PayrollStore } from "./store.js";
import { seal, unseal } from "./crypto.js";
export type XeroConfig = {
  XERO_CLIENT_ID?: string;
  XERO_CLIENT_SECRET?: string;
  XERO_TOKEN_KEY?: string;
  XERO_REDIRECT_URI?: string;
  XERO_ENABLE_TRACKING?: string;
};
export const scopes =
  "offline_access payroll.timesheets payroll.employees.read payroll.settings.read";
export class XeroClient {
  constructor(
    readonly store: PayrollStore,
    readonly config: XeroConfig,
    readonly http: typeof fetch = fetch,
    readonly sleep = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  configured() {
    return Boolean(
      this.config.XERO_CLIENT_ID &&
      this.config.XERO_CLIENT_SECRET &&
      this.config.XERO_TOKEN_KEY &&
      this.config.XERO_REDIRECT_URI,
    );
  }
  requireConfig() {
    if (!this.configured())
      throw new PayrollError(
        503,
        "请在服务端配置 XERO_CLIENT_ID、XERO_CLIENT_SECRET、XERO_TOKEN_KEY、XERO_REDIRECT_URI",
      );
  }
  async exchange(data: Record<string, string>) {
    this.requireConfig();
    await this.store.renew();
    let response;
    try {
      response = await this.http("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          authorization:
            "Basic " +
            btoa(
              this.config.XERO_CLIENT_ID + ":" + this.config.XERO_CLIENT_SECRET,
            ),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new PayrollError(
        502,
        "Xero Token 请求超时或网络错误；请重试授权/刷新",
      );
    }
    if (!response.ok)
      throw new PayrollError(
        response.status === 400 ? 409 : 502,
        "Xero 授权或 Refresh Token 失效，请重新授权",
        response.headers.get("xero-correlation-id") ?? undefined,
      );
    const t: any = await response.json();
    if (!t.access_token || !t.refresh_token || !Number.isFinite(t.expires_in))
      throw new PayrollError(502, "Xero Token 响应不完整");
    const granted = new Set(String(t.scope ?? scopes).split(" "));
    if (scopes.split(" ").some((s) => !granted.has(s)))
      throw new PayrollError(403, "Xero 授权缺少必要 Payroll scopes");
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  }
  async tokens() {
    return this.store.lock("xero-refresh", async () => {
      const c = await this.store.get("connection");
      if (!c?.encrypted || c.reauthorizationRequired)
        throw new PayrollError(409, "Xero 未连接或需要重新授权");
      let t = await unseal(
        c.encrypted,
        this.config.XERO_TOKEN_KEY!,
        "xero:connection",
      );
      if (t.expiresAt > Date.now() + 60000) return t;
      try {
        t = await this.exchange({
          grant_type: "refresh_token",
          refresh_token: t.refreshToken,
        });
        c.encrypted = await seal(
          t,
          this.config.XERO_TOKEN_KEY!,
          "xero:connection",
        );
        await this.store.put("connection", "connection", c);
        return t;
      } catch (e) {
        if ((e as PayrollError).status === 409) {
          c.reauthorizationRequired = true;
          await this.store.put("connection", "connection", c);
        }
        throw e;
      }
    });
  }
  async request(
    path: string,
    {
      method = "GET",
      body,
      tenant,
      idempotencyKey,
    }: {
      method?: string;
      body?: any;
      tenant?: string;
      idempotencyKey?: string;
    } = {},
  ) {
    let unauthorized = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await this.tokens();
      await this.store.renew();
      let response;
      try {
        response = await this.http("https://api.xero.com" + path, {
          method,
          headers: {
            authorization: "Bearer " + token.accessToken,
            accept: "application/json",
            ...(tenant ? { "xero-tenant-id": tenant } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw new PayrollError(
          502,
          method === "GET"
            ? "Xero 查询超时，请重试"
            : "Xero 写入结果未知；系统会先核对远端工时表再重试",
        );
      }
      const correlation =
        response.headers.get("xero-correlation-id") ??
        response.headers.get("x-correlation-id") ??
        undefined;
      if (response.status === 429) {
        const raw = response.headers.get("retry-after"),
          seconds =
            raw && /^\d+$/.test(raw)
              ? Number(raw)
              : raw
                ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000)
                : 2 ** attempt;
        if (attempt === 3 || !Number.isFinite(seconds) || seconds > 15)
          throw new PayrollError(
            429,
            `Xero 限流，请在 ${raw ?? "稍后"} 重试`,
            correlation,
          );
        await this.sleep(Math.max(seconds * 1000, 1000 * 2 ** attempt));
        continue;
      }
      if (response.status === 401 && !unauthorized) {
        unauthorized = true;
        const c = await this.store.get("connection");
        if (c?.encrypted) {
          const t = await unseal(
            c.encrypted,
            this.config.XERO_TOKEN_KEY!,
            "xero:connection",
          );
          t.expiresAt = 0;
          c.encrypted = await seal(
            t,
            this.config.XERO_TOKEN_KEY!,
            "xero:connection",
          );
          await this.store.put("connection", "connection", c);
        }
        continue;
      }
      if (!response.ok) {
        if (response.status === 401) {
          const c = await this.store.get("connection");
          c.reauthorizationRequired = true;
          await this.store.put("connection", "connection", c);
        }
        let detail = "";
        if (response.status === 400) {
          const v: any = await response.json().catch(() => null);
          detail = String(
            v?.problem?.detail ?? v?.detail ?? v?.Message ?? "",
          ).slice(0, 600);
          const fields = v?.problem?.invalidFields ?? v?.invalidFields;
          if (Array.isArray(fields))
            detail = (
              detail +
              "; " +
              fields
                .map(
                  (f: any) =>
                    String(f.name ?? "") + ": " + String(f.reason ?? ""),
                )
                .join("; ")
            ).slice(0, 1000);
        }
        throw new PayrollError(
          response.status === 401
            ? 409
            : response.status >= 500
              ? 502
              : response.status,
          `Xero ${response.status}${detail ? ": " + detail : ""}`,
          correlation,
        );
      }
      const result: any =
        response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (
        result.problem ||
        result.Status === "ERROR" ||
        result.timesheet?.validationErrors?.length
      )
        throw new PayrollError(
          400,
          "Xero 返回业务校验错误：" +
            String(
              result.problem?.detail ??
                result.Message ??
                "请检查员工、日期和 Earnings Rate",
            ).slice(0, 600),
          correlation,
        );
      return { data: result, correlation };
    }
    throw new PayrollError(502, "Xero 请求未完成");
  }
  async paged(path: string, collection: string, tenant: string) {
    const all: any[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data } = await this.request(
        path + (path.includes("?") ? "&" : "?") + "page=" + page,
        { tenant },
      );
      const rows = data[collection];
      if (!Array.isArray(rows))
        throw new PayrollError(502, "Xero " + collection + " 响应格式无效");
      all.push(...rows);
      if (
        data.pagination ? page >= data.pagination.pageCount : rows.length < 100
      )
        return all;
    }
    throw new PayrollError(
      413,
      "Xero 结果超过本次安全分页上限，请缩小组织范围",
    );
  }
  async references(tenant: string) {
    const employees = await this.paged(
      "/payroll.xro/1.0/Employees",
      "Employees",
      tenant,
    );
    const list = [];
    for (const summary of employees) {
      const { data } = Object.hasOwn(summary, "PayrollCalendarID")
        ? { data: { Employees: [summary] } }
        : await this.request(
            "/payroll.xro/1.0/Employees/" +
              encodeURIComponent(summary.EmployeeID),
            { tenant },
          );
      const e = data.Employees?.[0];
      if (!e) throw new PayrollError(502, "Xero 员工详情缺失");
      list.push({
        EmployeeID: e.EmployeeID,
        EmployeeNumber: e.EmployeeNumber ?? null,
        FirstName: e.FirstName,
        LastName: e.LastName,
        Email: e.Email ?? null,
        Status: e.Status ?? null,
        TerminationDate: e.TerminationDate ?? null,
        PayrollCalendarID: e.PayrollCalendarID ?? null,
        OrdinaryEarningsRateID: e.OrdinaryEarningsRateID ?? null,
      });
    }
    const calendars = (
      await this.request("/payroll.xro/1.0/PayrollCalendars", { tenant })
    ).data.PayrollCalendars;
    const rates = (await this.request("/payroll.xro/1.0/PayItems", { tenant }))
      .data.PayItems?.EarningsRates;
    const tracking = await this.tracking(tenant);
    if (
      !Array.isArray(calendars) ||
      !Array.isArray(rates) ||
      !Array.isArray(tracking)
    )
      throw new PayrollError(502, "Xero Payroll Settings 响应不完整");
    return {
      employees: list,
      calendars,
      rates,
      tracking,
      fetchedAt: new Date().toISOString(),
    };
  }
  async tracking(tenant: string) {
    const settings = (
      await this.request("/payroll.xro/1.0/Settings", { tenant })
    ).data.Settings;
    let tracking: any[] = [];
    const category =
      settings?.TrackingCategories?.TimesheetCategories?.TrackingCategoryID;
    if (category && this.config.XERO_ENABLE_TRACKING === "1") {
      const data = (
        await this.request(
          "/api.xro/2.0/TrackingCategories/" + encodeURIComponent(category),
          { tenant },
        )
      ).data;
      tracking = (data.TrackingCategories?.[0]?.Options ?? [])
        .filter((o: any) => o.Status === "ACTIVE")
        .map((o: any) => ({
          TrackingItemID: o.TrackingOptionID,
          Name: o.Name,
        }));
    }
    return tracking;
  }
  async timesheets(group: any, tenant: string) {
    const query = new URLSearchParams({
      filter: `employeeId==${group.employeeID}`,
    });
    return this.paged(
      "/payroll.xro/2.0/Timesheets?" + query,
      "timesheets",
      tenant,
    );
  }
  async sheet(id: string, tenant: string) {
    const { data, correlation } = await this.request(
      "/payroll.xro/2.0/Timesheets/" + encodeURIComponent(id),
      { tenant },
    );
    if (!data.timesheet?.timesheetID)
      throw new PayrollError(502, "Xero 工时表对象缺失", correlation);
    return data.timesheet;
  }
}
