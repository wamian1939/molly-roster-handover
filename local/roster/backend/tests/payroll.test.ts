import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
// Disposable workerd/D1 validates the same SQL used by the hosted adapter.
import { Miniflare } from "miniflare";
import { PayrollStore } from "../src/payroll/store.js";
import { XeroClient, scopes } from "../src/payroll/xero.js";
import { PayrollService } from "../src/payroll/service.js";
import {
  prepareShifts,
  paidMinutes,
  hours,
  payrollPeriod,
  buildTargets,
} from "../src/payroll/preparation.js";
import { seal, unseal } from "../src/payroll/crypto.js";
import { canonicalSheet } from "../src/payroll/sync.js";
import express from "express";
import request from "supertest";
import { createPayrollRouter } from "../src/payroll/routes.js";
import { HttpError } from "../src/httpError.js";
import { createRouter } from "../src/routes.js";
const uuid = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const tenant = uuid(1),
  emp = uuid(2),
  emp2 = uuid(3),
  cal = uuid(4),
  rate = uuid(5);
class FakeXero {
  reads = 0;
  sheets: any[] = [];
  refreshes = 0;
  creates = 0;
  lineUpdates = 0;
  writes = 0;
  limits = 0;
  tokensInvalid = false;
  failEmployee = "";
  timeoutAfterCreate = false;
  badTotal = false;
  unauthorized = false;
  detailFailure = false;
  lineFailure = 0;
  employees = [
    {
      EmployeeID: emp,
      FirstName: "Alice",
      LastName: "Test",
      Email: "alice@example.test",
      PayrollCalendarID: cal,
    },
    {
      EmployeeID: emp2,
      FirstName: "Bob",
      LastName: "Test",
      PayrollCalendarID: cal,
    },
  ];
  calendars = [
    {
      PayrollCalendarID: cal,
      Name: "Fortnightly",
      CalendarType: "FORTNIGHTLY",
      StartDate: "2026-11-16",
    },
  ];
  rates = [
    {
      EarningsRateID: rate,
      Name: "Ordinary Hours",
      RateType: "RATEPERUNIT",
      TypeOfUnits: "Hours",
    },
  ];
  response = (v: any, status = 200) =>
    Response.json(v, {
      status,
      headers: { "xero-correlation-id": "fake-correlation" },
    });
  http: typeof fetch = async (input, init) => {
    const u = new URL(String(input)),
      method = init?.method ?? "GET",
      headers = new Headers(init?.headers),
      body = init?.body
        ? JSON.parse(
            String(init.body).startsWith("{") ? String(init.body) : "{}",
          )
        : {};
    if (method === "GET") this.reads++;
    if (u.hostname === "identity.xero.com") {
      this.refreshes++;
      if (this.tokensInvalid)
        return this.response({ error: "invalid_grant" }, 400);
      return this.response({
        access_token: "fake-access-" + this.refreshes,
        refresh_token: "rotating-refresh-" + this.refreshes,
        expires_in: 1800,
        scope: scopes,
      });
    }
    if (this.limits > 0) {
      this.limits--;
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "0" } },
      );
    }
    if (this.unauthorized) {
      this.unauthorized = false;
      return this.response({}, 401);
    }
    if (u.pathname === "/connections")
      return this.response([
        {
          id: uuid(9),
          tenantId: tenant,
          tenantName: "Disposable AU Demo",
          tenantType: "ORGANISATION",
        },
      ]);
    if (u.pathname.startsWith("/connections/"))
      return new Response(null, { status: 204 });
    expect(headers.get("xero-tenant-id")).toBe(tenant);
    if (u.pathname === "/payroll.xro/1.0/Employees")
      return this.response({ Employees: this.employees });
    if (u.pathname.startsWith("/payroll.xro/1.0/Employees/"))
      return this.response({
        Employees: this.employees.filter(
          (e) => e.EmployeeID === u.pathname.split("/").at(-1),
        ),
      });
    if (u.pathname.endsWith("/PayrollCalendars"))
      return this.response({ PayrollCalendars: this.calendars });
    if (u.pathname.endsWith("/PayItems"))
      return this.response({ PayItems: { EarningsRates: this.rates } });
    if (u.pathname.endsWith("/Settings"))
      return this.response({ Settings: { TrackingCategories: {} } });
    const prefix = "/payroll.xro/2.0/Timesheets";
    if (!u.pathname.startsWith(prefix))
      throw Error("Unmocked endpoint " + u.pathname);
    const parts = u.pathname.slice(prefix.length).split("/").filter(Boolean);
    if (!parts.length && method === "GET") {
      const id = u.searchParams.get("filter")?.split("==")[1]?.split(",")[0];
      return this.response({
        timesheets: this.sheets.filter((s) => !id || s.employeeID === id),
        pagination: { page: 1, pageCount: 1 },
      });
    }
    if (!parts.length && method === "POST") {
      expect(body.employeeID).toBeTruthy();
      expect(body.EmployeeID).toBeUndefined();
      expect(headers.get("idempotency-key")).toBeTruthy();
      if (this.failEmployee === body.employeeID)
        return this.response({ detail: "Employee rejected" }, 400);
      this.writes++;
      this.creates++;
      const sheet = {
        ...body,
        timesheetID: uuid(100 + this.creates),
        status: "Draft",
        timesheetLines: body.timesheetLines.map((l: any, i: number) => ({
          ...l,
          timesheetLineID: uuid(1000 + this.creates * 20 + i),
        })),
      };
      sheet.totalHours = sheet.timesheetLines.reduce(
        (n: number, l: any) => n + l.numberOfUnits,
        0,
      );
      this.sheets.push(sheet);
      if (this.timeoutAfterCreate) {
        this.timeoutAfterCreate = false;
        throw Error("Disconnected AFTER successful write");
      }
      return this.response({ timesheet: sheet });
    }
    const s = this.sheets.find((s) => s.timesheetID === parts[0]);
    if (!s) return this.response({}, 404);
    if (parts.length === 1 && method === "GET") {
      if (this.detailFailure) return this.response({}, 503);
      return this.response({
        timesheet: { ...s, totalHours: s.totalHours + (this.badTotal ? 1 : 0) },
      });
    }
    if (s.status !== "Draft") return this.response({}, 400);
    this.writes++;
    if (this.lineFailure && this.writes === this.lineFailure)
      throw Error("line write unavailable");
    if (parts[1] === "Lines") {
      if (method === "PUT") {
        this.lineUpdates++;
        const index = s.timesheetLines.findIndex(
          (l: any) => l.timesheetLineID === parts[2],
        );
        if (index < 0) return this.response({}, 404);
        s.timesheetLines[index] = { ...body, timesheetLineID: parts[2] };
      } else if (method === "DELETE")
        s.timesheetLines = s.timesheetLines.filter(
          (l: any) => l.timesheetLineID !== parts[2],
        );
      else
        s.timesheetLines.push({
          ...body,
          timesheetLineID: uuid(2000 + this.writes),
        });
      s.totalHours = s.timesheetLines.reduce(
        (n: number, l: any) => n + l.numberOfUnits,
        0,
      );
      return this.response({ timesheet: s });
    }
    throw Error("Unmocked method " + method + u.pathname);
  };
}
let mf: Miniflare,
  store: PayrollStore,
  remote: FakeXero,
  client: XeroClient,
  service: PayrollService,
  sources: any[];
const baseShift = (id = "shift-1", employeeId = "roster-a") => ({
  id,
  date: "2026-11-16",
  startAt: "2026-11-15T23:00:00.000Z",
  endAt: "2026-11-16T06:00:00.000Z",
  breakMinutes: 60,
  assignments: [{ employeeId, employeeNameSnapshot: employeeId }],
});
const source = (
  shift = baseShift(),
  storeId = "hurstville",
  periodId = "week1",
) => ({
  storeId,
  periodId,
  sourceKey: storeId + ":" + periodId,
  timezone: "Australia/Sydney",
  period: { id: periodId },
  shifts: [shift],
});
const config = {
  XERO_CLIENT_ID: "fake-id",
  XERO_CLIENT_SECRET: "fake-secret",
  XERO_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  XERO_REDIRECT_URI: "https://roster.test/api/payroll/oauth/callback",
};
beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  const ddl = await readFile(
    new URL(
      "../prisma/migrations/20261117010000_xero_payroll/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of ddl.split(";"))
    if (statement.trim()) await db.prepare(statement).run();
  store = new PayrollStore({
    query: async (sql, args = []) => {
      const result = await db
        .prepare(sql)
        .bind(...(args as any[]))
        .all();
      return result.results;
    },
  });
  remote = new FakeXero();
  client = new XeroClient(store, config, remote.http, async () => {});
  sources = [source()];
  service = new PayrollService(store, client, async (selections) =>
    sources.filter((s) =>
      selections.some(
        (v) => v.storeId === s.storeId && v.periodId === s.periodId,
      ),
    ),
  );
  await store.put("connection", "connection", {
    tenantId: tenant,
    organizationName: "Disposable AU Demo",
    selectionRevision: "selection-1",
    encrypted: await seal(
      {
        accessToken: "fake-access",
        refreshToken: "fake-refresh",
        expiresAt: Date.now() + 1800000,
      },
      config.XERO_TOKEN_KEY,
      "xero:connection",
    ),
  });
  await service.references(true);
  await service.saveMappings("admin", {
    tenantId: tenant,
    version: 0,
    employees: {
      "roster-a": { xeroEmployeeId: emp, status: "Matched" },
      "roster-b": { xeroEmployeeId: emp2, status: "Matched" },
    },
    rates: { Ordinary: rate },
    tracking: {},
  });
}, 30000);
afterEach(async () => {
  await mf.dispose();
});
const selections = () =>
  sources.map((s) => ({ storeId: s.storeId, periodId: s.periodId }));
async function confirmed() {
  let p = await service.preview("admin", selections());
  p = await service.savePreview("admin", p.id, {
    version: p._version,
    rows: p.rows.map((r: any) => ({
      id: r.id,
      paidMinutes: r.paidMinutes,
      unpaidBreakMinutes: r.unpaidBreakMinutes,
      category: "Ordinary",
      confirmed: true,
      reason: "核对实际工时",
      breakAllocationConfirmed: true,
    })),
  });
  return service.confirm("admin", p.id, p._version, true);
}
async function synced() {
  const p = await confirmed(),
    j = await service.start("admin", p.id);
  let result = j;
  for (const _ of j.records) result = await service.process("admin", j.id);
  return { p, j: result };
}
describe("Payroll preparation", () => {
  it("fresh preflight is reused for confirmation, with a live recheck still required before writes", async () => {
    let p = await service.preview("admin", selections());
    p = await service.savePreview("admin", p.id, {
      version: p._version,
      rows: p.rows.map((r: any) => ({
        id: r.id,
        paidMinutes: r.paidMinutes,
        unpaidBreakMinutes: r.unpaidBreakMinutes,
        category: "Ordinary",
        confirmed: true,
        reason: "Verified actual hours",
      })),
    });
    await service.validate(p.id);
    const reads = remote.reads;
    p = await service.confirm("admin", p.id, p._version, true);
    expect(remote.reads).toBe(reads);
    const job = await service.start("admin", p.id);
    await service.process("admin", job.id);
    expect(remote.reads).toBeGreaterThan(reads);
  });
  it("actual CSV output contains the same paid hours as payroll preparation", async () => {
    const s = baseShift();
    const app = express();
    app.use(
      "/api",
      createRouter(
        {} as any,
        {
          exportPeriod: async () => ({
            period: { startDate: "2026-11-16" },
            shifts: [
              {
                ...s,
                roleNameSnapshot: "Role",
                publicNote: null,
                internalNote: null,
                assignments: [
                  {
                    employeeNameSnapshot: "Alice",
                    officialScoreSnapshot: null,
                    tierSnapshot: null,
                  },
                ],
              },
            ],
          }),
          getSettings: async () => ({ timezone: "Australia/Sydney" }),
        } as any,
      ),
    );
    const response = await request(app)
      .get(
        "/api/roster/export.csv?storeId=hurstville&periodId=week1&audience=manager",
      )
      .set("x-test-user-role", "ADMIN");
    expect(response.status).toBe(200);
    expect(
      response.text
        .split("\r\n")
        .at(-1)
        ?.split(",")
        .at(-1)
        ?.replaceAll('"', ""),
    ).toBe(hours(prepareShifts([source()])[0].paidMinutes).toFixed(4));
  });
  it("stale mapping versions cannot confirm different employees behind the UI", async () => {
    const p = await service.preview("admin", selections());
    const maps = await service.mappings();
    await service.saveMappings("other-admin", {
      ...maps,
      version: maps._version,
    });
    await expect(
      service.validate(p.id, true, maps._version),
    ).rejects.toMatchObject({ status: 409 });
    expect((await service.getPreview(p.id)).status).toBe("Draft");
  });
  it("each saved correction retains an immutable before-image without unbounded single-row history", async () => {
    let p = await service.preview("admin", selections());
    for (const minutes of [360, 420, 390]) {
      const version = p._version;
      p = await service.savePreview("admin", p.id, {
        version,
        rows: p.rows.map((r: any) => ({
          id: r.id,
          paidMinutes: minutes,
          unpaidBreakMinutes: 60,
          category: "Ordinary",
          confirmed: true,
          reason: "Verified actual hours",
        })),
      });
      expect((await service.revisions(p.id, version)).before._version).toBe(
        version,
      );
      expect(p.changes).toHaveLength(1);
    }
    expect((await service.revisions(p.id)).length).toBe(3);
  });
  it("one day multiple shifts; unpaid break and no-break retained to minutes", () => {
    const a = baseShift(),
      b = {
        ...baseShift("shift-2"),
        startAt: "2026-11-16T07:00:00Z",
        endAt: "2026-11-16T10:00:00Z",
        breakMinutes: 0,
      };
    const rows = prepareShifts([{ ...source(), shifts: [a, b] }]);
    expect(rows.map((r) => r.paidMinutes)).toEqual([360, 180]);
    expect(hours(541)).toBe(9.0167);
    expect(paidMinutes(a.startAt, a.endAt, 60)).toBe(360);
    expect(() => paidMinutes(a.startAt, a.endAt, 421)).toThrow();
  });
  it("cross-midnight splits actual elapsed minutes; break allocation requires confirmation", () => {
    const s = {
      ...baseShift(),
      startAt: "2026-11-16T12:00:00Z",
      endAt: "2026-11-16T16:00:00Z",
      breakMinutes: 30,
    };
    const rows = prepareShifts([source(s)]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(rows.reduce((n, r) => n + r.paidMinutes, 0)).toBe(210);
    expect(rows.every((r) => r.requiresBreakAllocation)).toBe(true);
  });
  it("Sydney and Melbourne DST use elapsed minutes rather than wall-clock subtraction", () => {
    for (const zone of ["Australia/Sydney", "Australia/Melbourne"]) {
      const spring = {
        ...baseShift(),
        startAt: "2026-10-03T15:00:00Z",
        endAt: "2026-10-03T17:00:00Z",
        breakMinutes: 0,
      };
      expect(
        prepareShifts([{ ...source(spring), timezone: zone }])[0].paidMinutes,
      ).toBe(120);
      const fall = {
        ...spring,
        startAt: "2026-04-04T14:00:00Z",
        endAt: "2026-04-04T18:00:00Z",
      };
      expect(
        prepareShifts([{ ...source(fall), timezone: zone }])[0].paidMinutes,
      ).toBe(240);
    }
  });
  it("fortnight/weekly calendar boundaries split on actual Xero anchors", () => {
    expect(payrollPeriod("2026-11-29", remote.calendars[0])).toEqual({
      startDate: "2026-11-16",
      endDate: "2026-11-29",
    });
    expect(payrollPeriod("2026-11-30", remote.calendars[0]).startDate).toBe(
      "2026-11-30",
    );
    expect(
      payrollPeriod("2026-11-23", {
        ...remote.calendars[0],
        CalendarType: "WEEKLY",
      }).startDate,
    ).toBe("2026-11-23");
    expect(() =>
      payrollPeriod("2026-11-23", { CalendarType: "TWICEMONTHLY" }),
    ).toThrow();
  });
  it("unmatched employees, missing earnings rate and unconfirmed actuals block validation", async () => {
    const p = await service.preview("admin", selections()),
      refs = await service.references();
    expect(
      buildTargets(p.rows, { employees: {}, rates: {} }, refs).errors.some(
        (e) => e.reason.includes("未匹配"),
      ),
    ).toBe(true);
    const maps = await service.mappings();
    maps.rates = {};
    expect(
      buildTargets(p.rows, maps, refs).errors.some((e) =>
        e.reason.includes("Earnings Rate"),
      ),
    ).toBe(true);
    expect(
      (await service.validate(p.id)).errors.some((e) =>
        e.reason.includes("实际工时"),
      ),
    ).toBe(true);
  });
  it("same employee across stores merges without double-counting; overlaps rejected", async () => {
    sources.push(
      source(
        {
          ...baseShift("shift-2"),
          startAt: "2026-11-16T07:00:00Z",
          endAt: "2026-11-16T10:00:00Z",
          breakMinutes: 0,
        },
        "townhall",
        "week1",
      ),
    );
    const p = await confirmed();
    expect(p.validation.groups).toHaveLength(1);
    expect(p.validation.groups[0].lines[0].numberOfUnits).toBe(9);
    expect(p.validation.totalPaidHours).toBe(9);
    expect(() =>
      prepareShifts([source(), source(baseShift("overlap"), "townhall")]),
    ).toThrow();
  });
  it("roster export and Xero preparation use identical paid minute calculation", () => {
    const s = baseShift();
    expect(prepareShifts([source(s)])[0].paidMinutes).toBe(
      paidMinutes(s.startAt, s.endAt, s.breakMinutes),
    );
    expect(hours(paidMinutes(s.startAt, s.endAt, s.breakMinutes))).toBe(6);
  });
});
describe("Real OAuth implementation with fake HTTP only", () => {
  it("disconnect and tenant selection preserve freshly rotated token versions", async () => {
    let c = await store.get("connection");
    c.encrypted = await seal(
      { accessToken: "expired", refreshToken: "refresh", expiresAt: 0 },
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    await store.put("connection", "connection", c);
    await service.select("admin", tenant, tenant);
    expect(remote.refreshes).toBe(1);
    c = await store.get("connection");
    const t = await unseal(
      c.encrypted,
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    t.expiresAt = 0;
    c.encrypted = await seal(t, config.XERO_TOKEN_KEY, "xero:connection");
    await store.put("connection", "connection", c);
    await service.disconnect("admin");
    expect(remote.refreshes).toBe(2);
    expect((await service.status()).connected).toBe(false);
    expect((await store.get("connection")).encrypted).toBeNull();
  });
  it("one-use state bound to initiating admin and session; encrypted tokens never in status", async () => {
    const { url } = await service.connect("admin", "cookie-a");
    const state = new URL(url).searchParams.get("state")!;
    await expect(
      service.callback("admin", "cookie-b", { state, code: "x" }),
    ).rejects.toThrow("state");
    await service.callback("admin", "cookie-a", { state, code: "x" });
    await expect(
      service.callback("admin", "cookie-a", { state, code: "x" }),
    ).rejects.toThrow("state");
    expect(JSON.stringify(await service.status())).not.toContain("refresh");
    const c = await store.get("connection");
    expect(c.encrypted).not.toContain("fake-access");
    expect(c.tenantId).toBeNull();
    await service.select("admin", tenant, null);
    expect((await service.status()).connected).toBe(true);
  });
  it("rotates refresh token, serializes concurrent refresh and marks invalid grant", async () => {
    const c = await store.get("connection");
    c.encrypted = await seal(
      { accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 },
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    await store.put("connection", "connection", c);
    await client.tokens();
    expect(remote.refreshes).toBe(1);
    const rotated = await unseal(
      (await store.get("connection")).encrypted,
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    expect(rotated.refreshToken).toBe("rotating-refresh-1");
    await client.tokens();
    expect(remote.refreshes).toBe(1);
    rotated.expiresAt = 0;
    const updated = await store.get("connection");
    updated.encrypted = await seal(
      rotated,
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    await store.put("connection", "connection", updated);
    remote.tokensInvalid = true;
    await expect(client.tokens()).rejects.toThrow("重新授权");
    expect((await service.status()).reauthorizationRequired).toBe(true);
  });
  it("429 follows Retry-After with bounded retries; 401 refreshes once", async () => {
    remote.limits = 2;
    expect((await client.request("/connections")).data).toHaveLength(1);
    remote.unauthorized = true;
    await client.request("/connections");
    expect(remote.refreshes).toBe(1);
    remote.limits = 5;
    await expect(client.request("/connections")).rejects.toMatchObject({
      status: 429,
    });
  });
});
describe("Timesheets v2 business reconciliation", () => {
  it("splits an overnight shift across two payroll periods and creates oldest first", async () => {
    sources = [
      source({
        ...baseShift(),
        startAt: "2026-11-29T12:00:00Z",
        endAt: "2026-11-29T16:00:00Z",
        breakMinutes: 0,
      }),
    ];
    const { j } = await synced();
    expect(j.records).toHaveLength(2);
    expect(j.records.every((r: any) => r.status === "Success")).toBe(true);
    expect(remote.sheets.map((s: any) => s.startDate)).toEqual([
      "2026-11-16",
      "2026-11-30",
    ]);
    expect(
      remote.sheets.reduce((n: number, s: any) => n + s.totalHours, 0),
    ).toBe(4);
  });
  it("old destination can only be released after a real remote read proves its Draft hours cleared", async () => {
    await synced();
    const target = (await service.targets())[0];
    await expect(
      service.reconcileTarget(
        "admin",
        target.id,
        target._version,
        target.timesheetId,
      ),
    ).rejects.toThrow();
    remote.sheets[0].timesheetLines = [];
    remote.sheets[0].totalHours = 0;
    await service.reconcileTarget(
      "admin",
      target.id,
      target._version,
      target.timesheetId,
    );
    expect((await store.get(target.id)).contributions).toEqual([]);
    const maps = await service.mappings();
    maps.employees = {
      "roster-a": { xeroEmployeeId: emp2, status: "Matched" },
    };
    await service.saveMappings("admin", { ...maps, version: maps._version });
    expect((await synced()).j.status).toBe("Completed");
  });
  it("admin-only routes enforce auth, CSRF and do not expose stored secrets", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/payroll",
      createPayrollRouter(
        {
          me: async () => {
            throw new HttpError(401, "Login required");
          },
        } as any,
        service,
      ),
    );
    app.use((e: any, _q: any, r: any, _next: any) =>
      r.status(e.status ?? 500).json({ message: e.message }),
    );
    expect((await request(app).get("/api/payroll/status")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/payroll/status")
          .set("x-test-user-role", "STORE_EVALUATOR")
      ).status,
    ).toBe(403);
    const status = await request(app)
      .get("/api/payroll/status")
      .set("x-test-user-role", "ADMIN");
    expect(status.status).toBe(200);
    expect(JSON.stringify(status.body)).not.toContain("encrypted");
    expect(
      (
        await request(app)
          .post("/api/payroll/connect")
          .set("x-test-user-role", "ADMIN")
          .send({})
      ).status,
    ).toBe(403);
    const response = await request(app)
      .post("/api/payroll/connect")
      .set("origin", "https://roster.test")
      .set("x-test-user-role", "ADMIN")
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.url).not.toContain("fake-secret");
  });
  it("creates only Draft and repeated submission produces no extra hours", async () => {
    const { p, j } = await synced();
    expect(j.status).toBe("Completed");
    expect(remote.creates).toBe(1);
    expect(remote.sheets[0].totalHours).toBe(6);
    expect((await service.start("admin", p.id)).id).toBe(j.id);
    const again = await synced();
    expect(again.j.records[0].status).toBe("Skipped");
    expect(remote.creates).toBe(1);
    expect(remote.sheets[0].status).toBe("Draft");
  });
  it("updates existing Draft by TimesheetLineID; retains unrelated manual lines", async () => {
    await synced();
    const s = remote.sheets[0];
    s.timesheetLines.push({
      timesheetLineID: uuid(90),
      date: "2026-11-25",
      earningsRateID: rate,
      numberOfUnits: 2,
    });
    s.totalHours = 8;
    sources[0].shifts[0].breakMinutes = 30;
    const result = await synced();
    expect(result.j.status).toBe("Completed");
    expect(remote.lineUpdates).toBe(1);
    expect(remote.sheets[0].totalHours).toBe(8.5);
    expect(
      remote.sheets[0].timesheetLines.some(
        (l: any) => l.timesheetLineID === uuid(90),
      ),
    ).toBe(true);
  });
  it("never overwrites Approved or unknown-state timesheets, nor historical timesheets", async () => {
    await synced();
    const p = await confirmed();
    remote.sheets[0].status = "Approved";
    const validation = await service.validate(p.id);
    expect(validation.errors.map((e) => e.reason).join("|")).toContain(
      "Approved",
    );
    const count = remote.writes;
    await expect(confirmed()).rejects.toThrow();
    expect(remote.writes).toBe(count);
    remote.sheets[0].startDate = "2026-12-01";
    remote.sheets[0].endDate = "2026-12-14";
    expect(
      (await service.validate(p.id)).errors.some((e) =>
        e.reason.includes("历史"),
      ),
    ).toBe(true);
  });
  it("partial success; failed-only retry retains successful employees", async () => {
    sources[0].shifts[0].assignments.push({
      employeeId: "roster-b",
      employeeNameSnapshot: "Bob",
    });
    const p = await confirmed(),
      job = await service.start("admin", p.id);
    remote.failEmployee = emp2;
    await service.process("admin", job.id);
    let j = await service.process("admin", job.id);
    expect(j.records.map((r: any) => r.status)).toEqual(["Success", "Failed"]);
    expect(j.records[1].correlationIds).toContain("fake-correlation");
    remote.failEmployee = "";
    await service.retry("admin", job.id);
    j = await service.process("admin", job.id);
    expect(j.status).toBe("Completed");
    expect(remote.creates).toBe(2);
  });
  it("write timeout AFTER create is reconciled by reading remote before retry", async () => {
    remote.timeoutAfterCreate = true;
    const { j } = await synced();
    expect(j.status).toBe("Completed");
    expect(remote.creates).toBe(1);
    expect(remote.sheets[0].totalHours).toBe(6);
  });
  it("HTTP success with inconsistent hours is not business success", async () => {
    remote.badTotal = true;
    const { j } = await synced();
    expect(j.records[0].status).toBe("Failed");
    expect(j.records[0].error).toContain("总工时");
    expect(remote.creates).toBe(1);
  });
  it("organisation/mapping/source changes and concurrent operations fail closed", async () => {
    const p = await confirmed();
    sources[0].shifts[0].breakMinutes = 0;
    await expect(service.start("admin", p.id)).rejects.toThrow("排班");
    let release!: () => void;
    const holding = store.lock(
      "xero-operation",
      () => new Promise<void>((r) => (release = r)),
    );
    await new Promise((r) => setTimeout(r, 30));
    const other = new PayrollStore(store.sql);
    await expect(other.lock("xero-operation", async () => {})).rejects.toThrow(
      "正在进行",
    );
    release();
    await holding;
    const c = await store.get("connection");
    c.tenantId = uuid(44);
    await store.put("connection", "connection", c);
    await expect(service.getPreview(p.id)).rejects.toThrow("Organization");
  });
  it("two disjoint weekly exports retain contributions in a fortnightly timesheet", async () => {
    await synced();
    sources = [
      source(
        {
          ...baseShift("week2"),
          startAt: "2026-11-22T23:00:00Z",
          endAt: "2026-11-23T06:00:00Z",
        },
        "hurstville",
        "week2",
      ),
    ];
    const { j } = await synced();
    expect(j.status).toBe("Completed");
    expect(remote.sheets).toHaveLength(1);
    expect(remote.sheets[0].totalHours).toBe(12);
    expect(canonicalSheet(remote.sheets[0]).lines).toHaveLength(2);
  });
  it("removing the final shift creates explicit zero-hour reconciliation instead of leaving old pay", async () => {
    await synced();
    sources[0].shifts = [];
    const p = await service.preview("admin", selections());
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].removedFromRoster).toBe(true);
    expect(p.rows[0].confirmed).toBe(false);
    const { j } = await synced();
    expect(j.status).toBe("Completed");
    expect(remote.sheets[0].timesheetLines).toHaveLength(0);
    expect(remote.sheets[0].totalHours).toBe(0);
  });
  it("duplicate canonical source versions are rejected even when shift IDs differ", () => {
    expect(() =>
      prepareShifts([
        source(),
        source({
          ...baseShift("recreated"),
          startAt: "2026-11-16T07:00:00Z",
          endAt: "2026-11-16T10:00:00Z",
        }),
      ]),
    ).toThrow("one version");
  });
  it("remapping already-synced source cannot create pay for another Xero employee", async () => {
    await synced();
    const maps = await service.mappings();
    maps.employees = {
      "roster-a": { xeroEmployeeId: emp2, status: "Matched" },
    };
    await service.saveMappings("admin", { ...maps, version: maps._version });
    await expect(confirmed()).rejects.toThrow("destination");
    expect(remote.creates).toBe(1);
  });
  it("same calendar ID with changed anchor, or same rate ID with non-hour units, fails before writing", async () => {
    const p = await confirmed(),
      j = await service.start("admin", p.id);
    remote.calendars[0].StartDate = "2026-11-17";
    let result = await service.process("admin", j.id);
    expect(result.records[0].status).toBe("Failed");
    expect(remote.writes).toBe(0);
    remote.calendars[0].StartDate = "2026-11-16";
    remote.rates[0].TypeOfUnits = "Kilometres";
    await service.retry("admin", j.id);
    result = await service.process("admin", j.id);
    expect(result.records[0].status).toBe("Failed");
    expect(remote.writes).toBe(0);
  });
  it("combined daily actual minutes across multiple rates cannot exceed 24 hours", async () => {
    const refs = await service.references(),
      maps = await service.mappings();
    refs.rates.push({ ...refs.rates[0], EarningsRateID: uuid(77) });
    maps.rates.Second = uuid(77);
    const row = {
      employeeId: "roster-a",
      date: "2026-11-16",
      confirmed: true,
      reason: "confirmed actual",
      category: "Ordinary",
      paidMinutes: 1000,
    };
    expect(
      buildTargets(
        [row, { ...row, category: "Second" }],
        maps,
        refs,
      ).errors.some((e) => e.reason.includes("24 hours")),
    ).toBe(true);
  });
  it("parallel token refresh attempts never race rotating refresh tokens", async () => {
    const c = await store.get("connection");
    c.encrypted = await seal(
      { accessToken: "old", refreshToken: "old", expiresAt: 0 },
      config.XERO_TOKEN_KEY,
      "xero:connection",
    );
    await store.put("connection", "connection", c);
    const other = new XeroClient(
      new PayrollStore(store.sql),
      config,
      remote.http,
      async () => {},
    );
    const results = await Promise.allSettled([client.tokens(), other.tokens()]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(remote.refreshes).toBe(1);
  });
  it("upstream Xero invalid grant is a local 409 rather than logging the Roster user out", async () => {
    remote.tokensInvalid = true;
    await expect(
      client.exchange({ grant_type: "authorization_code", code: "invalid" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("partial line update failure resumes and retains ownership of appended lines", async () => {
    await synced();
    sources[0].shifts.push({
      ...baseShift("day2"),
      startAt: "2026-11-16T23:00:00Z",
      endAt: "2026-11-17T06:00:00Z",
    });
    sources[0].shifts.push({
      ...baseShift("day3"),
      startAt: "2026-11-17T23:00:00Z",
      endAt: "2026-11-18T06:00:00Z",
    });
    const p = await confirmed(),
      j = await service.start("admin", p.id);
    remote.lineFailure = 3;
    let result = await service.process("admin", j.id);
    expect(result.records[0].status).toBe("Failed");
    remote.lineFailure = 0;
    await service.retry("admin", j.id);
    result = await service.process("admin", j.id);
    expect(result.status).toBe("Completed");
    expect(remote.sheets[0].totalHours).toBe(18);
    sources[0].shifts = [sources[0].shifts[0]];
    result = (await synced()).j;
    expect(result.status).toBe("Completed");
    expect(remote.sheets[0].totalHours).toBe(6);
  });
});
