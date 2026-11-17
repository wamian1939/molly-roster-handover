import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { createRouter } from "../src/routes.js";

function reviewedScriptCommit<T extends object>(payload: T, preview: { body: {
  previewHash: string; slotStatusHash: string; summary: { create: number; unchanged: number };
} }) {
  return { ...payload, previewHash: preview.body.previewHash,
    expectedSlotStatusHash: preview.body.slotStatusHash,
    expectedCreateCount: preview.body.summary.create, expectedUnchangedCount: preview.body.summary.unchanged };
}

function setup(evaluate: Record<string, unknown> = {}) {
  const upstream = {
    storeJobs: vi.fn(async () => new Response(JSON.stringify([{ id: "job-1", storeId: "store-1", name: "收银", code: "cashier", colorToken: "blue", displayOrder: 1, isActive: true }]), { status: 200 })),
    ...evaluate,
  };
  const roster = {
    calendar: vi.fn(async () => ({ periods: [], shifts: [] })),
    listPeriods: vi.fn(async () => []),
    replayShiftWithPeriod: vi.fn(async (): Promise<{ id: string } | null> => null),
    commitDraftPeriod: vi.fn(async () => ({ saved: [], deletedIds: [] })),
    createPeriod: vi.fn(), publishPeriod: vi.fn(async () => ({ period: { id: "period-1" } })), reopenPeriod: vi.fn(), deleteShift: vi.fn(), getShift: vi.fn(async () => ({ id: "shift-1", date: "2026-09-08" })), listRoles: vi.fn(async () => [{ id: "role-1", storeId: "store-1", code: "cashier", nameZh: "收银", isActive: true }, { id: "role-2", storeId: null, code: "cashier", nameZh: "收银", isActive: true }]), listDraftRoleUsage: vi.fn(async () => [{ id: "legacy", code: "qa-role", nameZh: "验收岗", isActive: true, shiftCount: 2, firstDate: "2026-09-07" }]), createRole: vi.fn(async () => ({ id: "role-1" })), updateRole: vi.fn(async () => ({ id: "role-1" })), listShiftTemplates: vi.fn(async () => []), createShiftTemplate: vi.fn(async () => ({ id: "template-1" })), updateShiftTemplate: vi.fn(async () => ({ id: "template-1", isActive: false, version: 2 })), getSettings: vi.fn(async (): Promise<{ timezone: string; version?: number } | null> => ({ timezone: "Australia/Sydney", version: 1 })), saveSettings: vi.fn(async () => ({ storeId: "store-1" })), createShift: vi.fn(), repositionShift: vi.fn(async () => ({ id: "shift-1" })),
    batchDelete: vi.fn(async (_storeId: string, items: unknown[]) => ({ deleted: items.length })),
    batchUpdate: vi.fn(async (_storeId: string, items: unknown[]) => ({ updated: items.length })),
    previewCopyPeriod: vi.fn(async () => ({ canCopy: true })), copyPeriod: vi.fn(async () => ({ id: "copied-period" })),
    previewCopyDay: vi.fn(async () => ({ canCopy: true })), copyDay: vi.fn(async () => ({ created: 1 })),
    previewRepeatShift: vi.fn(async () => ({ canCopy: true })), repeatShift: vi.fn(async () => ({ created: 1 })),
    replaceAvailability: vi.fn(async () => ({ updated: 1 })),
    createAvailabilityTemplate: vi.fn(async () => ({ id: "availability-template-1" })),
    updateAvailabilityTemplate: vi.fn(async () => ({ id: "availability-template-1", version: 2 })),
    listAvailability: vi.fn(async () => []),
    getPresetShortcuts: vi.fn(async (): Promise<{ storeId: string; version: number; shortcuts: Array<{
      code: string; startTime: string; endTime: string;
    }> } | null> => ({ storeId: "store-1", version: 1,
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] })),
    savePresetShortcuts: vi.fn(async () => ({ storeId: "store-1", version: 1,
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] })),
    listAssignedShiftsForPresetPreview: vi.fn(async (): Promise<Array<{
      employeeId: string; date: string; startAt: string; endAt: string;
    }>> => []),
    commitPresetTimeSlots: vi.fn(async () => ({ importId: "import-1", alreadyImported: false, created: 1, unchanged: 0 })),
    exportPeriod: vi.fn(async () => ({ period: { startDate: "2026-09-07", endDate: "2026-09-13", status: "PUBLISHED" }, shifts: [{ date: "2026-09-07", startAt: "2026-09-07T09:00:00Z", endAt: "2026-09-07T10:00:00Z", breakMinutes: 0, roleNameSnapshot: "前场", publicNote: "公开", internalNote: "内部", assignments: [{ employeeNameSnapshot: "=危险", officialScoreSnapshot: "80", tierSnapshot: "T2" }] }] })),
    exportPublication: vi.fn(async () => ({ period: { startDate: "2026-09-07", endDate: "2026-09-13", status: "PUBLISHED" }, shifts: [{ date: "2026-09-07", startAt: "2026-09-07T09:00:00Z", endAt: "2026-09-07T10:00:00Z", breakMinutes: 0, roleNameSnapshot: "历史前场", publicNote: "历史公开", internalNote: "历史内部", assignments: [{ employeeNameSnapshot: "历史员工", officialScoreSnapshot: "90", tierSnapshot: "T1" }] }] })),
    listPublications: vi.fn(async () => [{ id: "publication-1", periodVersion: 2 }]),
    getPublication: vi.fn(async () => ({ id: "publication-1", snapshot: { shifts: [] } })),
  };
  const app = express(); app.use(express.json()); app.use("/api", createRouter(upstream as never, roster as never));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    const status = error instanceof ZodError ? 400 : typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    response.status(status).json({ message: error instanceof Error ? error.message : "request failed" });
  });
  return { app, roster };
}

describe("Roster routes store scope", () => {
  it("rejects administrator writes to unknown or inactive stores", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-27T00:00:00.000Z",
      stores: [
        { id: "store-1", name: "Own Store", isActive: true },
        { id: "retired-store", name: "Retired Store", isActive: false },
      ],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const admin = { "x-test-user-role": "ADMIN" };
    await request(app).post("/api/roster/periods").set(admin)
      .send({ storeId: "ghost-store", startDate: "2026-10-26", endDate: "2026-11-01", cycleType: "WEEK" }).expect(404);
    await request(app).post("/api/roster/templates").set(admin)
      .send({ storeId: "ghost-store", name: "Early", startTime: "10:00", endTime: "17:00", breakMinutes: 0 }).expect(404);
    await request(app).post("/api/roster/availability-templates").set(admin)
      .send({ storeId: "ghost-store", name: "Unknown", slots: [{ dayOffset: 0, status: "UNKNOWN", startTime: null, endTime: null }] }).expect(404);
    await request(app).put("/api/roster/settings/ghost-store").set(admin)
      .send({ storeId: "ghost-store", timezone: "Australia/Sydney", openingTime: "10:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 180, defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 }).expect(404);
    await request(app).put("/api/roster/availability-script/shortcuts").set(admin)
      .send({ storeId: "ghost-store", shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] }).expect(404);
    await request(app).post("/api/roster/batch/delete").set(admin)
      .send({ storeId: "ghost-store", items: [{ id: "shift-1", version: 1 }] }).expect(404);
    await request(app).post("/api/roster/batch/delete").set(admin)
      .send({ storeId: "retired-store", items: [{ id: "shift-1", version: 1 }] }).expect(404);
    expect(roster.createPeriod).not.toHaveBeenCalled();
    expect(roster.createShiftTemplate).not.toHaveBeenCalled();
    expect(roster.createAvailabilityTemplate).not.toHaveBeenCalled();
    expect(roster.saveSettings).not.toHaveBeenCalled();
    expect(roster.savePresetShortcuts).not.toHaveBeenCalled();
    expect(roster.batchDelete).not.toHaveBeenCalled();
    expect(integration).toHaveBeenCalledTimes(7);
    await request(app).post("/api/roster/periods").set(admin)
      .send({ storeId: "store-1", startDate: "2026-10-26", endDate: "2026-11-01", cycleType: "WEEK" }).expect(201);
    expect(roster.createPeriod).toHaveBeenCalledOnce();
    await request(app).post("/api/roster/periods")
      .set({ "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" })
      .send({ storeId: "ghost-store", startDate: "2026-10-26", endDate: "2026-11-01", cycleType: "WEEK" }).expect(403);
    expect(integration).toHaveBeenCalledTimes(8);
  });

  it("returns only authorized stores even if Evaluate sends a broader store list", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z",
      stores: [
        { id: "store-1", name: "Own Store", isActive: true },
        { id: "store-2", name: "Other Store", isActive: true },
      ],
    }), { status: 200 }));
    const { app } = setup({ integration });
    const evaluator = await request(app).get("/api/workforce/stores")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(evaluator.body.stores.map((store: { id: string }) => store.id)).toEqual(["store-1"]);
    const admin = await request(app).get("/api/workforce/stores")
      .set("x-test-user-role", "ADMIN").expect(200);
    expect(admin.body.stores.map((store: { id: string }) => store.id)).toEqual(["store-1", "store-2"]);
  });

  it("reports malformed successful Evaluate workforce envelopes as upstream failures", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.4.0" }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const evaluator = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    for (const path of ["/api/workforce/stores", "/api/workforce/skill-definitions",
      "/api/workforce/stores/store-1/employees", "/api/workforce/employees/employee-1"]) {
      await request(app).get(path).set(evaluator).expect(503);
    }
    await request(app).post("/api/roster/batch/delete").set("x-test-user-role", "ADMIN")
      .send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }] }).expect(503);
    expect(roster.batchDelete).not.toHaveBeenCalled();
  });

  it("authorizes a draft commit before dispatch", async () => {
    const { app, roster } = setup();
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const body = { storeId: "store-1", rosterPeriodId: "period-1", changes: [{ kind: "delete", shiftId: "shift-1", baseVersion: 2 }] };
    await request(app).post("/api/roster/shifts/draft-commit").set(headers).send({ ...body, storeId: "store-2" }).expect(403);
    expect(roster.commitDraftPeriod).not.toHaveBeenCalled();
    await request(app).post("/api/roster/shifts/draft-commit").set(headers).send(body).expect(200);
    expect(roster.commitDraftPeriod).toHaveBeenCalledWith("store-1", "period-1", body.changes, "test-user");
  });
  it("returns an authorized existing create request without calling Evaluate again", async () => {
    const storeJobs = vi.fn(async () => new Response(JSON.stringify({ message: "Evaluate unavailable" }), { status: 503 }));
    const { app, roster } = setup({ storeJobs });
    roster.replayShiftWithPeriod.mockResolvedValue({ id: "existing-request-shift" });
    const body = { storeId: "store-1", targetStartDate: "2026-09-07", targetEndDate: "2026-09-13", date: "2026-09-08",
      startAt: "2026-09-08T09:00:00.000Z", endAt: "2026-09-08T17:00:00.000Z", breakMinutes: 0,
      shiftRoleId: "role-1", employeeIds: ["employee-1"], clientShiftId: "93fc1014-59eb-471d-b3c1-8c632f48d02a" };
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/shifts/with-period").set(headers).send({ ...body, storeId: "store-2" }).expect(403);
    expect(roster.replayShiftWithPeriod).not.toHaveBeenCalled();
    const response = await request(app).post("/api/roster/shifts/with-period").set(headers).send(body).expect(200);
    expect(response.body.id).toBe("existing-request-shift");
    expect(roster.replayShiftWithPeriod).toHaveBeenCalledOnce();
    expect(storeJobs).not.toHaveBeenCalled();
  });
  it("rejects a nonexistent calendar date before dispatching a read", async () => {
    const { app, roster } = setup();
    await request(app).get("/api/roster/calendar?storeId=store-1&from=2026-02-30&to=2026-03-06")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(400);
    expect(roster.calendar).not.toHaveBeenCalled();
  });
  it("bounds calendar, period and availability reads to one year", async () => {
    const { app, roster } = setup();
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    for (const path of ["periods", "calendar", "availability"]) {
      await request(app).get(`/api/roster/${path}?storeId=store-1&from=1900-01-01&to=2099-12-31`)
        .set(headers).expect(400);
      await request(app).get(`/api/roster/${path}?storeId=store-1&from=2028-12-31&to=2028-01-01`)
        .set(headers).expect(400);
    }
    expect(roster.listPeriods).not.toHaveBeenCalled();
    expect(roster.calendar).not.toHaveBeenCalled();
    expect(roster.listAvailability).not.toHaveBeenCalled();
    await request(app).get("/api/roster/periods?storeId=store-1&from=2028-01-01&to=2028-12-31")
      .set(headers).expect(200);
  });
  it("forwards Evaluate login throttling without creating a Roster session", async () => {
    const login = vi.fn(async () => new Response(JSON.stringify({ message: "Too many login attempts" }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "900" },
    }));
    const { app } = setup({ login });
    const response = await request(app).post("/api/auth/login").send({ username: "pilot", password: "invalid" }).expect(429);
    expect(response.headers["retry-after"]).toBe("900");
    expect(response.body).toEqual({ message: "Too many login attempts" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("does not forward a login cookie when Evaluate returns an invalid user", async () => {
    const login = vi.fn(async () => new Response(JSON.stringify({ user: {
      id: "u1", accountId: "u1", userId: "u1", username: "manager", displayName: "Manager", role: "ADMIN",
    } }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "evaluate_molly_session=opaque; HttpOnly" } }));
    const { app } = setup({ login });
    const response = await request(app).post("/api/auth/login").send({ username: "manager", password: "example" }).expect(503);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("forwards a valid Evaluate login user and cookie", async () => {
    const user = { id: "u1", accountId: "u1", userId: "u1", username: "manager", displayName: "Manager",
      role: "ADMIN", storeIds: [], stores: [], canAccessAllStores: true };
    const login = vi.fn(async () => new Response(JSON.stringify({ user }), {
      status: 200, headers: { "content-type": "application/json", "set-cookie": "evaluate_molly_session=opaque; HttpOnly" },
    }));
    const { app } = setup({ login });
    const response = await request(app).post("/api/auth/login").send({ username: "manager", password: "example" }).expect(200);
    expect(response.body).toEqual({ user });
    expect(response.headers["set-cookie"]).toEqual(["evaluate_molly_session=opaque; HttpOnly"]);
  });
  it("allows a store evaluator to read their own calendar", async () => {
    const { app, roster } = setup();
    await request(app).get("/api/roster/calendar?storeId=store-1&from=2026-09-07&to=2026-09-13").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(roster.calendar).toHaveBeenCalledWith("store-1", "2026-09-07", "2026-09-13");
  });

  it("rejects contradictory UNKNOWN template days on create and update", async () => {
    const { app, roster } = setup();
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const unknown = { dayOffset: 0, status: "UNKNOWN", startTime: null, endTime: null };
    const timed = { dayOffset: 0, status: "AVAILABLE", startTime: "09:00", endTime: "17:00" };
    const body = { storeId: "store-1", name: "Week pattern", slots: [unknown, timed] };
    await request(app).post("/api/roster/availability-templates").set(headers).send(body).expect(400);
    await request(app).post("/api/roster/availability-templates").set(headers).send({ ...body, slots: [unknown, unknown] }).expect(400);
    await request(app).patch("/api/roster/availability-templates/availability-template-1")
      .set(headers).send({ ...body, isActive: true, displayOrder: 0, version: 1 }).expect(400);
    expect(roster.createAvailabilityTemplate).not.toHaveBeenCalled();
    expect(roster.updateAvailabilityTemplate).not.toHaveBeenCalled();

    await request(app).post("/api/roster/availability-templates").set(headers)
      .send({ ...body, slots: [unknown, { ...timed, dayOffset: 1 }] }).expect(201);
    expect(roster.createAvailabilityTemplate).toHaveBeenCalledOnce();
  });

  it("limits draft role inventory to an authorized store", async () => {
    const { app, roster } = setup();
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).get("/api/roster/roles/draft-usage?storeId=store-2").set(headers).expect(403);
    expect(roster.listDraftRoleUsage).not.toHaveBeenCalled();
    const result = await request(app).get("/api/roster/roles/draft-usage?storeId=store-1").set(headers).expect(200);
    expect(result.body).toEqual([{ id: "legacy", code: "qa-role", nameZh: "验收岗", isActive: true, shiftCount: 2, firstDate: "2026-09-07" }]);
    expect(roster.listDraftRoleUsage).toHaveBeenCalledExactlyOnceWith("store-1");
  });

  it("proxies only active formal jobs from the authorized Evaluate store", async () => {
    const storeJobs = vi.fn(async () => new Response(JSON.stringify([
      { id: "job-1", storeId: "store-1", name: "全岗", code: "full-role", colorToken: "teal", displayOrder: 1, isActive: true },
      { id: "job-2", storeId: "store-1", name: "旧岗", code: "old", colorToken: "slate", displayOrder: 2, isActive: false },
    ]), { status: 200 }));
    const { app } = setup({ storeJobs });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).get("/api/workforce/stores/store-2/jobs").set(headers).expect(403);
    expect(storeJobs).not.toHaveBeenCalled();
    const response = await request(app).get("/api/workforce/stores/store-1/jobs").set(headers).expect(200);
    expect(response.body.jobs.map((job: { id: string }) => job.id)).toEqual(["job-1"]);
    expect(storeJobs).toHaveBeenCalledOnce();
  });

  it("reports an invalid successful Evaluate job response as an upstream failure", async () => {
    const storeJobs = vi.fn(async () => new Response("<html>upstream proxy</html>", { status: 200 }));
    const { app } = setup({ storeJobs });
    const response = await request(app).get("/api/workforce/stores/store-1/jobs")
      .set({ "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" }).expect(503);
    expect(response.body.message).toContain("Evaluate Molly");
    storeJobs.mockResolvedValueOnce(new Response("null", { status: 200 }));
    await request(app).get("/api/workforce/stores/store-1/jobs")
      .set({ "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" }).expect(503);
  });

  it("rejects cross-store reads before service access", async () => {
    const { app, roster } = setup();
    await request(app).get("/api/roster/calendar?storeId=store-2&from=2026-09-07&to=2026-09-13").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(403);
    expect(roster.calendar).not.toHaveBeenCalled();
  });

  it("rejects cross-store publish, reopen, and delete before integration or database access", async () => {
    const integration = vi.fn();
    const { app, roster } = setup({ integration });
    const evaluator = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/periods/period-2/publish").set(evaluator)
      .send({ storeId: "store-2", version: 1 }).expect(403);
    await request(app).post("/api/roster/periods/period-2/reopen").set(evaluator)
      .send({ storeId: "store-2", version: 1 }).expect(403);
    await request(app).delete("/api/roster/shifts/shift-2?storeId=store-2&version=1")
      .set(evaluator).expect(403);
    await request(app).post("/api/roster/batch/delete").set(evaluator)
      .send({ storeId: "store-2", items: [{ id: "shift-2", version: 1 }] }).expect(403);
    expect(integration).not.toHaveBeenCalled();
    expect(roster.publishPeriod).not.toHaveBeenCalled();
    expect(roster.reopenPeriod).not.toHaveBeenCalled();
    expect(roster.deleteShift).not.toHaveBeenCalled();
    expect(roster.batchDelete).not.toHaveBeenCalled();
  });

  it("looks up a shift by stable ID within the authenticated store", async () => {
    const { app, roster } = setup();
    const evaluator = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).get("/api/roster/shifts/shift-1?storeId=store-2").set(evaluator).expect(403);
    expect(roster.getShift).not.toHaveBeenCalled();
    const response = await request(app).get("/api/roster/shifts/shift-1?storeId=store-1").set(evaluator).expect(200);
    expect(response.body).toEqual({ id: "shift-1", date: "2026-09-08" });
    expect(roster.getShift).toHaveBeenCalledWith("store-1", "shift-1");
  });

  it("accepts every authorized store for a multi-store evaluator", async () => {
    const { app, roster } = setup();
    const evaluator = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-ids": "store-1,store-2" };
    await request(app).get("/api/roster/calendar?storeId=store-2&from=2026-09-07&to=2026-09-13").set(evaluator).expect(200);
    await request(app).get("/api/roster/calendar?storeId=store-3&from=2026-09-07&to=2026-09-13").set(evaluator).expect(403);
    expect(roster.calendar).toHaveBeenCalledTimes(1);
  });

  it("returns active roles normally and restricts inactive-role administration", async () => {
    const { app, roster } = setup();
    await request(app).get("/api/roster/roles?storeId=store-1").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(roster.listRoles).toHaveBeenLastCalledWith("store-1", false);

    await request(app).get("/api/roster/roles?storeId=store-1&includeInactive=true").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(403);
    await request(app).get("/api/roster/roles?storeId=store-1&includeInactive=true").set("x-test-user-role", "ADMIN").expect(200);
    expect(roster.listRoles).toHaveBeenLastCalledWith("store-1", true);
  });

  it("cannot reactivate a local role absent from Evaluate's formal jobs", async () => {
    const { app, roster } = setup();
    roster.listRoles.mockResolvedValue([{ id: "legacy-role", storeId: "store-1", code: "qa-role", nameZh: "Legacy QA", isActive: false }]);
    const payload = { storeId: "store-1", nameZh: "Legacy QA", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 1, version: 1 };
    await request(app).patch("/api/roster/roles/legacy-role")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(payload).expect(422);
    expect(roster.updateRole).not.toHaveBeenCalled();
  });

  it("does not reactivate a store role over an existing formal-job association", async () => {
    const { app, roster } = setup();
    roster.listRoles.mockResolvedValue([
      { id: "global-cashier", storeId: null, code: "cashier", nameZh: "收银", isActive: true },
      { id: "inactive-local", storeId: "store-1", code: "cashier", nameZh: "收银", isActive: false },
    ]);
    const payload = { storeId: "store-1", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 1, version: 1 };
    const response = await request(app).patch("/api/roster/roles/inactive-local")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(payload).expect(409);
    expect(response.body.message).toContain("已有排班岗位关联");
    expect(roster.updateRole).not.toHaveBeenCalled();
  });

  it("keeps the existing mapped store role editable", async () => {
    const { app, roster } = setup();
    const payload = { storeId: "store-1", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 2, version: 1 };
    await request(app).patch("/api/roster/roles/role-1")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(payload).expect(200);
    expect(roster.updateRole).toHaveBeenCalledWith("role-1", { ...payload, colorToken: "#1e40af" }, [expect.objectContaining({ id: "job-1", code: "cashier" })]);
  });

  it("uses Evaluate's color when reactivating a previously inactive role", async () => {
    const { app, roster } = setup();
    roster.listRoles.mockResolvedValue([{ id: "inactive-cashier", storeId: "store-1", code: "cashier",
      nameZh: "收银", colorToken: "#ff0000", isActive: false, version: 1 }]);
    const payload = { storeId: "store-1", nameZh: "收银", colorToken: "#ff0000", requiredSkillCodes: [],
      isActive: true, displayOrder: 1, version: 1 };
    await request(app).patch("/api/roster/roles/inactive-cashier")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(payload).expect(200);
    expect(roster.updateRole).toHaveBeenCalledWith("inactive-cashier", { ...payload, colorToken: "#1e40af" },
      [expect.objectContaining({ id: "job-1" })]);
  });

  it("rejects a hidden global alias and a fake name for the selected formal role", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({ contractVersion: "1.4.0", generatedAt: "2026-10-16T00:00:00Z", employees: [employee()], workforceRevision: "r1", pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false } }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/shifts").set(headers)
      .send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-2", employeeIds: ["employee-1"] })
      .expect(422);
    await request(app).post("/api/roster/templates").set(headers)
      .send({ storeId: "store-1", name: "Hidden role template", startTime: "09:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: "role-2" })
      .expect(422);
    await request(app).patch("/api/roster/roles/role-1").set(headers)
      .send({ storeId: "store-1", nameZh: "验收岗", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 1, version: 1 })
      .expect(422);
    expect(roster.createShift).not.toHaveBeenCalled();
    expect(roster.updateRole).not.toHaveBeenCalled();
  });

  it("allows retiring a template with a removed formal role but blocks reactivation", async () => {
    const { app, roster } = setup({ storeJobs: vi.fn(async () => new Response("[]", { status: 200 })) });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const body = { storeId: "store-1", name: "Legacy shift", startTime: "10:00", endTime: "17:00",
      breakMinutes: 30, shiftRoleId: "legacy-role", displayOrder: 0, version: 1 };
    await request(app).patch("/api/roster/templates/template-1").set(headers)
      .send({ ...body, isActive: false }).expect(200);
    expect(roster.updateShiftTemplate).toHaveBeenCalledWith("template-1", { ...body, isActive: false });
    await request(app).patch("/api/roster/templates/template-1").set(headers)
      .send({ ...body, isActive: true }).expect(422);
    expect(roster.updateShiftTemplate).toHaveBeenCalledTimes(1);
  });

  it("passes current formal role IDs and names to copy previews and commits", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({ contractVersion: "1.4.0", generatedAt: "2026-10-16T00:00:00Z", employees: [employee()], workforceRevision: "r1", pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false } }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const week = { storeId: "store-1", sourcePeriodId: "period-1", targetStartDate: "2026-10-19" };
    const day = { storeId: "store-1", sourceDate: "2026-10-09", targetDate: "2026-10-10" };
    const repeat = { storeId: "store-1", sourceShiftId: "shift-1", targetDates: ["2026-10-10"] };
    await request(app).post("/api/roster/batch/copy/preview").set(headers).send(week).expect(200);
    await request(app).post("/api/roster/batch/copy").set(headers).send({ ...week, expectedSourcePeriodVersion: 1 }).expect(201);
    await request(app).post("/api/roster/batch/copy-day/preview").set(headers).send(day).expect(200);
    await request(app).post("/api/roster/batch/copy-day").set(headers).send({ ...day, expectedSourcePeriodVersion: 1, expectedTargetPeriodVersion: null }).expect(201);
    await request(app).post("/api/roster/batch/repeat/preview").set(headers).send(repeat).expect(200);
    await request(app).post("/api/roster/batch/repeat").set(headers).send({ ...repeat, expectedSourcePeriodVersion: 1, expectedTargetPeriodVersions: [{ date: "2026-10-10", version: null }] }).expect(201);
    for (const method of [roster.previewCopyPeriod, roster.previewCopyDay, roster.previewRepeatShift])
      expect(method).toHaveBeenCalledWith(expect.objectContaining({ formalRoleIds: ["role-1"] }));
    for (const method of [roster.copyPeriod, roster.copyDay, roster.repeatShift])
      expect(method).toHaveBeenCalledWith(expect.objectContaining({ formalRoleIds: ["role-1"], formalRoleNames: { "role-1": "收银" }, formalRoleColors: { "role-1": "#1e40af" },
        activeEmployeeIds: ["employee-1"], currentAssignments: [expect.objectContaining({ employeeId: "employee-1", officialScoreSnapshot: 82.4, tierSnapshot: "T2", officialScoreRoundId: "round-1" })] }), "test-user");
  });

  it("reserves an exact job code without promoting a duplicate-name legacy role", async () => {
    const storeJobs = vi.fn(async () => new Response(JSON.stringify([
      { id: "job-name", storeId: "store-1", name: "Front", code: "other-code", colorToken: "blue", displayOrder: 1, isActive: true },
      { id: "job-code", storeId: "store-1", name: "Front", code: "official-front", colorToken: "teal", displayOrder: 2, isActive: true },
    ]), { status: 200 }));
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({ contractVersion: "1.4.0", generatedAt: "2026-10-16T00:00:00Z", employees: [employee()], workforceRevision: "r1", pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false } }), { status: 200 }));
    const { app, roster } = setup({ storeJobs, integration });
    roster.listRoles.mockResolvedValue([
      { id: "legacy", storeId: null, code: "legacy", nameZh: "Front", isActive: true },
      { id: "official", storeId: "store-1", code: "official-front", nameZh: "Front", isActive: true },
    ]);
    await request(app).post("/api/roster/batch/copy-day/preview")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send({ storeId: "store-1", sourceDate: "2026-10-09", targetDate: "2026-10-10" }).expect(200);
    expect(roster.previewCopyDay).toHaveBeenCalledWith(expect.objectContaining({ formalRoleIds: ["official"] }));
  });

  it("validates shift-role requirements against Evaluate's active skill catalog", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z", skills: [{ code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE" }] }), { status: 200 }));
    const storeJobs = vi.fn(async () => new Response(JSON.stringify([{ id: "job-1", storeId: "store-1", name: "收银", code: "cashier", colorToken: "blue", displayOrder: 1, isActive: true }]), { status: 200 }));
    const { app, roster } = setup({ integration, storeJobs });
    roster.listRoles.mockResolvedValue([]);
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1", cookie: "test=session" };
    const role = { storeId: "store-1", code: "cashier", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: ["order-taking"] };
    await request(app).post("/api/roster/roles").set(headers).send({ ...role, nameZh: "验收岗", requiredSkillCodes: [] }).expect(422);
    await request(app).post("/api/roster/roles").set(headers).send({ ...role, requiredSkillCodes: ["retired-code"] }).expect(400);
    expect(roster.createRole).not.toHaveBeenCalled();
    await request(app).post("/api/roster/roles").set(headers).send(role).expect(201);
    expect(roster.createRole).toHaveBeenCalledWith({ ...role, colorToken: "#1e40af" }, [expect.objectContaining({ id: "job-1", code: "cashier" })]);
    expect(integration).toHaveBeenCalledWith("/skill-definitions", expect.any(String));
    await request(app).patch("/api/roster/roles/role-1").set(headers).send({ ...role, requiredSkillCodes: ["retired-code"], isActive: true, displayOrder: 1, version: 1 }).expect(400);
    expect(roster.updateRole).not.toHaveBeenCalled();
  });

  it("does not replace an existing formal-job role with a new store role", async () => {
    const { app, roster } = setup();
    const body = { storeId: "store-1", code: "cashier", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [] };
    const response = await request(app).post("/api/roster/roles")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(body).expect(409);
    expect(response.body.message).toContain("已有排班岗位关联");
    expect(roster.createRole).not.toHaveBeenCalled();
  });

  it("returns a PII-free active skill catalog for the settings picker", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z", skills: [{ code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE", internalNote: "hidden" }] }), { status: 200 }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/skill-definitions").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body).toEqual({ skills: [{ code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE" }] });
  });

  it("fails closed when Evaluate's skill catalog is unavailable", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ message: "unavailable" }), { status: 503 }));
    const storeJobs = vi.fn(async () => new Response(JSON.stringify([{ id: "job-1", storeId: "store-1", name: "收银", code: "cashier", colorToken: "blue", displayOrder: 1, isActive: true }]), { status: 200 }));
    const { app, roster } = setup({ integration, storeJobs });
    roster.listRoles.mockResolvedValue([]);
    await request(app).post("/api/roster/roles").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", code: "cashier", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: ["order-taking"] }).expect(503);
    expect(roster.createRole).not.toHaveBeenCalled();
  });

  it("strips unexpected PII from workforce responses", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", generatedAt: "2026-09-07T00:00:00Z", employees: [{ ...employee(), email: "secret@example.com", phone: "0400000000", address: "hidden" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body.employees[0]).not.toHaveProperty("email");
    expect(response.body.employees[0]).not.toHaveProperty("phone");
    expect(response.body.employees[0]).not.toHaveProperty("address");
  });

  it("preserves official positions while keeping skill signals separate", async () => {
    const source = { ...employee(), positions: [{ id: "position-water", code: "water-bar", name: "Water bar" }] };
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-08T00:00:00Z", employees: [source] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body.employees[0].positions).toEqual(source.positions);
    expect(response.body.employees[0].skillSummary.qualifiedSkillCodes).toEqual(["cup-labeling"]);
  });

  it("rejects an incompatible workforce contract version", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "2.0.0", generatedAt: "2026-09-07T00:00:00Z", employees: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
  });

  it("rejects a malformed major-one contract version before scheduling from its workforce", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.invalid.0", generatedAt: "2026-10-27T00:00:00Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z",
        breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] }).expect(503);
    expect(roster.createShift).not.toHaveBeenCalled();
  });

  it("rejects an invalid Evaluate generatedAt before the Staff page formats it", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "not-a-date", employees: [employee()],
    }), { status: 200 }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
  });

  it("accepts a 500-employee roster-safe workforce payload", async () => {
    const employees = Array.from({ length: 500 }, (_, index) => ({ ...employee(), id: `employee-${index}`, displayName: `Team ${index}` }));
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", generatedAt: "2026-09-07T00:00:00Z", employees }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body.employees).toHaveLength(500);
  });

  it("reads all paginated Evaluate employees before exposing a workforce list", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-08T00:00:00Z",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-2" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: 100, total: 2, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body.employees.map((item: { id: string }) => item.id)).toEqual(["employee-1", "employee-2"]);
    expect(response.body).not.toHaveProperty("pagination");
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("rejects a same-total workforce replacement across 1.4 pages", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z",
      workforceRevision: path.includes("page=2") ? "after-transfer" : "before-transfer",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-3" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: 100, total: 2, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("rejects a 1.4 paged response that omits pagination metadata", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z", workforceRevision: "revision",
      employees: [employee()],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
  });

  it("rechecks the 1.4 workforce revision after collecting all pages", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z",
      workforceRevision: path.endsWith("pageSize=1") ? "after-transfer" : "before-transfer",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-2" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 2, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(3);
  });

  it("rejects a changed 1.4 workforce revision after a single page", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z",
      workforceRevision: path.endsWith("pageSize=1") ? "after-transfer" : "before-transfer",
      employees: [employee()],
      pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed contract version in the final 1.4 workforce verification", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: path.endsWith("pageSize=1") ? "1.5.0" : "1.4.0",
      generatedAt: "2026-10-09T00:00:00Z", workforceRevision: "stable-revision",
      employees: [employee()],
      pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched verification page while the workforce revision stays the same", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z", workforceRevision: "stable-revision",
      employees: [employee()],
      pagination: { page: path.endsWith("pageSize=1") ? 2 : 1,
        pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("accepts stable 1.4 pagination after the final revision check", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-09T00:00:00Z", workforceRevision: "stable-revision",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-2" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 2, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    const response = await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.body.employees.map((item: { id: string }) => item.id)).toEqual(["employee-1", "employee-2"]);
    expect(integration).toHaveBeenCalledTimes(3);
  });

  it("fails closed when Evaluate's paginated workforce changes during a read", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-2" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: 100, total: path.includes("page=2") ? 3 : 2, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("does not expose a partial workforce when the last page omits an employee", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z",
      employees: [{ ...employee(), id: path.includes("page=2") ? "employee-2" : "employee-1" }],
      pagination: { page: path.includes("page=2") ? 2 : 1, pageSize: 100, total: 3, hasMore: !path.includes("page=2") },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/stores/store-1/employees").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(503);
    expect(integration).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-store single employee reads after verifying the employee store", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", generatedAt: "2026-09-07T00:00:00Z", employee: { ...employee(), storeId: "store-2" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/employees/employee-1").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(403);
  });

  it("returns 404 when Evaluate has no employee for the requested canonical ID", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z", employee: null }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/employees/missing-id").set("x-test-user-role", "ADMIN").expect(404);
  });

  it("rejects a mismatched canonical employee ID from Evaluate", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z", employee: { ...employee(), id: "unexpected-id" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app } = setup({ integration });
    await request(app).get("/api/workforce/employees/employee-1").set("x-test-user-role", "ADMIN").expect(503);
  });

  it("does not schedule an employee returned under the wrong store", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00Z", employees: [{ ...employee(), storeId: "store-2" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] })
      .expect(503);
    expect(roster.createShift).not.toHaveBeenCalled();
  });

  it("surfaces an unavailable workforce service without entering roster writes", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ message: "员工数据暂时无法加载" }), { status: 503, headers: { "content-type": "application/json" } }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] }).expect(503);
    expect(roster.createShift).not.toHaveBeenCalled();
  });

  it("rejects archived employees before creating a shift", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", generatedAt: "2026-09-07T00:00:00Z", employees: [{ ...employee(), isActive: false }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] }).expect(400);
    expect(roster.createShift).not.toHaveBeenCalled();
  });

  it.each([
    ["archived", [{ ...employee(), isActive: false }]],
    ["transferred", []],
  ])("rejects availability writes for %s employees", async (_state, employees) => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"], expectedRows: [], entries: [{ date: "2026-09-07", status: "UNAVAILABLE" }] };
    await request(app).put("/api/roster/availability").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").set("cookie", "test=session").send(payload).expect(400);
    expect(roster.replaceAvailability).not.toHaveBeenCalled();
  });

  it("blocks script preview when an assigned shift would be outside imported availability", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA",
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] };
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const first = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(200);
    const slot = first.body.slots[0] as { date: string; startAt: string };
    roster.listAssignedShiftsForPresetPreview.mockResolvedValue([{ employeeId: "employee-1", date: slot.date,
      startAt: new Date(new Date(slot.startAt).getTime() - 3_600_000).toISOString(), endAt: slot.startAt }]);
    const blocked = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(200);
    expect(blocked.body).toMatchObject({ summary: { create: 0, unchanged: 0, conflict: 1 }, canCommit: false,
      issues: [{ code: "SHIFT_OUTSIDE_AVAILABILITY" }] });
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("requires explicit store timezone settings before script preview or commit", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    roster.getSettings.mockResolvedValue(null);
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    const preview = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(409);
    expect(preview.body.message).toContain("门店时区");
    const commit = await request(app).post("/api/roster/availability-script/commit").set(headers)
      .send({ ...payload, previewHash: "a".repeat(64), expectedSlotStatusHash: "b".repeat(64),
        expectedCreateCount: 1, expectedUnchangedCount: 0 }).expect(409);
    expect(commit.body.message).toContain("门店时区");
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("accepts joined weekday codes after a name across preview and commit", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006 1AA2AA34567AA" };
    const preview = await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send(payload).expect(200);
    expect(preview.body).toMatchObject({ canCommit: true, summary: { create: 7, unchanged: 0, conflict: 0 } });
    expect(preview.body.slots).toHaveLength(7);
    expect(preview.body.slots.every((slot: { employeeId: string }) => slot.employeeId === "employee-1")).toBe(true);
    await request(app).post("/api/roster/availability-script/commit").set(headers)
      .send(reviewedScriptCommit(payload, preview)).expect(200);
    const committed = roster.commitPresetTimeSlots.mock.calls.at(-1)?.[0] as { slots: Array<{ employeeId: string }> };
    expect(committed.slots).toHaveLength(7);
    expect(committed.slots.every((slot) => slot.employeeId === "employee-1")).toBe(true);
  });

  it("rejects a script commit whose preview fingerprint no longer matches", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA",
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }], previewHash: "0".repeat(64),
      expectedSlotStatusHash: "0".repeat(64),
      expectedCreateCount: 1, expectedUnchangedCount: 0 };
    await request(app).post("/api/roster/availability-script/commit")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send(payload).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("binds the reviewed create and unchanged counts to the script preview", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send({ ...reviewedScriptCommit(payload, preview), expectedCreateCount: 2 }).expect(409);
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send({ ...reviewedScriptCommit(payload, preview), expectedSlotStatusHash: "0".repeat(64) }).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("rejects a script commit after Evaluate's workforce revision changes since preview", async () => {
    let revision = "workforce-before";
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({
      contractVersion: "1.4.0", generatedAt: "2026-10-20T00:00:00Z", workforceRevision: revision,
      employees: [employee()], pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false },
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    expect(preview.body.canCommit).toBe(true);
    revision = "workforce-after";
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send(reviewedScriptCommit(payload, preview)).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("rejects a script commit when shortcut settings change after preview without changing its slots", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    expect(preview.body.canCommit).toBe(true);
    roster.getPresetShortcuts.mockResolvedValue({ storeId: "store-1", version: 2,
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" },
        { code: "BB", startTime: "09:00", endTime: "12:00" }] });
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send(reviewedScriptCommit(payload, preview)).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("does not preview a script against shortcuts newer than the editor version", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send({ storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA", expectedShortcutsVersion: 2 }).expect(409);
    expect(roster.listAvailability).not.toHaveBeenCalled();
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("rejects a script commit when store settings change after preview without changing timezone", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Sydney", version: 7 } as never);
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    expect(preview.body.canCommit).toBe(true);
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Sydney", version: 8 } as never);
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send(reviewedScriptCommit(payload, preview)).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("invalidates a mapped employee's reviewed name on a legacy Evaluate contract", async () => {
    let displayName = "HandoverEmployee006";
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-20T00:00:00Z",
      employees: [{ ...employee(), displayName }],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "BHS Alias\t1AA",
      employeeMappings: [{ nickname: "BHS Alias", employeeId: "employee-1" }] };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    expect(preview.body.canCommit).toBe(true);
    displayName = "HandoverEmployee006 Renamed";
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send(reviewedScriptCommit(payload, preview)).expect(409);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("passes the shortcut and store-settings versions read at commit into the locked transaction", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Sydney", version: 7 } as never);
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" };
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    await request(app).post("/api/roster/availability-script/commit")
      .set(headers).send(reviewedScriptCommit(payload, preview)).expect(200);
    expect(roster.commitPresetTimeSlots).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-1", expectedShortcutsVersion: 1, expectedSettingsVersion: 7,
      expectedCreateCount: 1, expectedUnchangedCount: 0,
      expectedSlotStatusHash: preview.body.slotStatusHash,
    }));
  });

  it("does not write availability when current Evaluate workforce is unavailable", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ message: "Evaluate unavailable" }), { status: 503 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"], expectedRows: [], entries: [{ date: "2026-09-07", status: "UNAVAILABLE" }] };
    await request(app).put("/api/roster/availability").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").set("cookie", "test=session").send(payload).expect(503);
    expect(roster.replaceAvailability).not.toHaveBeenCalled();
  });

  it("previews a script using current Evaluate identity and Roster data without writing", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA",
      shortcuts: [{ code: "AA", startTime: "01:00", endTime: "02:00" }] };
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send({ ...payload, storeId: "store-2" }).expect(403);
    expect(integration).not.toHaveBeenCalled();
    const result = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(200);
    expect(result.body).toMatchObject({ timezone: "Australia/Sydney",
      summary: { create: 1, unchanged: 0, conflict: 0 }, canCommit: true,
      slots: [{ employeeId: "employee-1", employeeName: "HandoverEmployee006", status: "CREATE" }] });
    const localStart = new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false })
      .format(new Date(result.body.slots[0].startAt));
    expect(localStart).toBe("10:00");
    expect(roster.listAvailability).toHaveBeenCalledOnce();
    expect(roster.replaceAvailability).not.toHaveBeenCalled();
  });

  it("resolves an explicit script nickname only to a current authorized Evaluate employee", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "BHS Alias\t1AA" };
    const unresolved = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(200);
    expect(unresolved.body).toMatchObject({ canCommit: false, issues: [{ code: "UNKNOWN_EMPLOYEE", nickname: "BHS Alias" }] });
    const mapped = await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send({ ...payload, employeeMappings: [{ nickname: "BHS Alias", employeeId: "employee-1" }] }).expect(200);
    expect(mapped.body).toMatchObject({ canCommit: true, slots: [{ employeeId: "employee-1", employeeName: "HandoverEmployee006" }] });
    const transferred = await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send({ ...payload, employeeMappings: [{ nickname: "BHS Alias", employeeId: "different-store" }] }).expect(200);
    expect(transferred.body).toMatchObject({ canCommit: false, issues: [{ code: "MAPPED_EMPLOYEE_MISSING" }] });
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("never lets a script mapping redirect a uniquely matched Evaluate name", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z",
      employees: [employee(), { ...employee(), id: "employee-2", displayName: "Cindy" }],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "HandoverEmployee006 1AA",
      employeeMappings: [{ nickname: "HandoverEmployee006", employeeId: "employee-2" }] };
    const preview = await request(app).post("/api/roster/availability-script/preview")
      .set(headers).send(payload).expect(200);
    expect(preview.body).toMatchObject({ canCommit: false, slots: [], issues: [{ code: "MAPPING_CONFLICT", nickname: "HandoverEmployee006" }] });
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("rechecks the mapped canonical employee at commit after a successful preview", async () => {
    let active = true;
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: active ? [employee()] : [],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const payload = { storeId: "store-1", week: "NEXT", script: "BHS Alias\t1AA",
      employeeMappings: [{ nickname: "BHS Alias", employeeId: "employee-1" }] };
    const preview = await request(app).post("/api/roster/availability-script/preview").set(headers).send(payload).expect(200);
    expect(preview.body.canCommit).toBe(true);
    active = false;
    await request(app).post("/api/roster/availability-script/commit").set(headers)
      .send(reviewedScriptCommit(payload, preview)).expect(422);
    expect(roster.commitPresetTimeSlots).not.toHaveBeenCalled();
  });

  it("scopes shortcut configuration and refuses preview before store setup", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()],
    }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).get("/api/roster/availability-script/shortcuts?storeId=store-2").set(headers).expect(403);
    await request(app).put("/api/roster/availability-script/shortcuts").set(headers)
      .send({ storeId: "store-2", shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] }).expect(403);
    expect(roster.getPresetShortcuts).not.toHaveBeenCalled();
    expect(roster.savePresetShortcuts).not.toHaveBeenCalled();
    await request(app).get("/api/roster/availability-script/shortcuts?storeId=store-1").set(headers).expect(200);
    await request(app).put("/api/roster/availability-script/shortcuts").set(headers)
      .send({ storeId: "store-1", shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] }).expect(200);
    expect(roster.savePresetShortcuts).toHaveBeenCalledWith({ storeId: "store-1",
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }], actorAccountId: "test-user" });
    const twentyLetterCode = "ABCDEFGHIJKLMNOPQRST";
    await request(app).put("/api/roster/availability-script/shortcuts").set(headers)
      .send({ storeId: "store-1", shortcuts: [{ code: twentyLetterCode, startTime: "10:00", endTime: "17:00" }] }).expect(200);
    expect(roster.savePresetShortcuts).toHaveBeenLastCalledWith({ storeId: "store-1",
      shortcuts: [{ code: twentyLetterCode, startTime: "10:00", endTime: "17:00" }], actorAccountId: "test-user" });
    await request(app).put("/api/roster/availability-script/shortcuts").set(headers)
      .send({ storeId: "store-1", shortcuts: [{ code: `${twentyLetterCode}U`, startTime: "10:00", endTime: "17:00" }] }).expect(400);
    expect(roster.savePresetShortcuts).toHaveBeenCalledTimes(2);
    roster.getPresetShortcuts.mockResolvedValueOnce(null);
    await request(app).post("/api/roster/availability-script/preview").set(headers)
      .send({ storeId: "store-1", week: "NEXT", script: "HandoverEmployee006\t1AA" }).expect(409);
    expect(roster.listAvailability).not.toHaveBeenCalled();
  });

  it("requires a read snapshot for Availability replacement", async () => {
    const { app, roster } = setup();
    await request(app).put("/api/roster/availability").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send({ storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"], entries: [] }).expect(400);
    expect(roster.replaceAvailability).not.toHaveBeenCalled();
  });

  it("does not move a saved shift when current workforce is unavailable", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ message: "Evaluate unavailable" }), { status: 503 }));
    const { app, roster } = setup({ integration });
    await request(app).patch("/api/roster/shifts/shift-1/reposition").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", targetStartDate: "2026-09-07", targetEndDate: "2026-09-13", version: 1 }).expect(503);
    expect(roster.repositionShift).not.toHaveBeenCalled();
  });

  it("does not move or batch-modify a shift when Evaluate formal jobs are unavailable", async () => {
    const storeJobs = vi.fn(async () => new Response(JSON.stringify({ message: "Evaluate unavailable" }), { status: 503 }));
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.4.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()] }), { status: 200 }));
    const { app, roster } = setup({ storeJobs, integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).patch("/api/roster/shifts/shift-1/reposition").set(headers).send({ storeId: "store-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", targetStartDate: "2026-09-07", targetEndDate: "2026-09-13", version: 1 }).expect(503);
    await request(app).post("/api/roster/batch/update").set(headers).send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }], patch: { publicNote: "test" } }).expect(503);
    expect(roster.repositionShift).not.toHaveBeenCalled();
    expect(roster.batchUpdate).not.toHaveBeenCalled();
  });

  it("passes only currently active employees to shift repositioning", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee(), { ...employee(), id: "archived-2", isActive: false }] }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", targetStartDate: "2026-09-07", targetEndDate: "2026-09-13", version: 1 };
    await request(app).patch("/api/roster/shifts/shift-1/reposition").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send(payload).expect(200);
    expect(roster.repositionShift).toHaveBeenCalledWith("shift-1", payload, "test-user", ["employee-1"], undefined, { "role-1": "收银" }, { "role-1": ["employee-1"] }, { "role-1": "#1e40af" });
  });

  it("requires a current same-store target snapshot for a cross-employee date move", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee(), { ...employee(), id: "employee-2", displayName: "Current Blair", isActive: true }] }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const payload = { storeId: "store-1", date: "2026-09-08", startAt: "2026-09-08T09:00:00.000Z", endAt: "2026-09-08T10:00:00.000Z", targetStartDate: "2026-09-07", targetEndDate: "2026-09-13", version: 1, sourceEmployeeId: "employee-1", targetEmployeeId: "employee-2" };
    await request(app).patch("/api/roster/shifts/shift-1/reposition").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send(payload).expect(200);
    expect(roster.repositionShift).toHaveBeenCalledWith("shift-1", payload, "test-user", ["employee-1", "employee-2"], {
      sourceEmployeeId: "employee-1", target: expect.objectContaining({ employeeId: "employee-2", employeeNameSnapshot: "Current Blair" }),
    }, { "role-1": "收银" }, { "role-1": ["employee-1", "employee-2"] }, { "role-1": "#1e40af" });
    await request(app).patch("/api/roster/shifts/shift-1/reposition").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ ...payload, targetEmployeeId: "other-store-employee" }).expect(400);
    expect(roster.repositionShift).toHaveBeenCalledTimes(1);
  });

  it("refreshes current workforce before publishing a draft", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify(path === "/stores"
      ? { contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", stores: [{ id: "store-1", name: "QA Store", isActive: true }] }
      : { contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [{ ...employee(), displayName: "Current Name", officialScore: { score: 91, tier: "T1", roundId: "closed-2", closedAt: "2026-10-09T00:00:00.000Z" } }] }), { status: 200 }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/periods/period-1/publish").set("x-test-user-role", "ADMIN").send({ storeId: "store-1", version: 1 }).expect(200);
    expect(roster.publishPeriod).toHaveBeenCalledWith("store-1", "period-1", 1, expect.any(Object), { id: "store-1", name: "QA Store" }, [expect.objectContaining({ employeeId: "employee-1", employeeNameSnapshot: "Current Name", officialScoreSnapshot: 91, officialScoreRoundId: "closed-2" })], ["role-1"], { "role-1": "收银" }, { "role-1": ["employee-1"] }, { "role-1": "#1e40af" });
  });

  it("does not publish when the current Evaluate workforce cannot be read", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify(path === "/stores"
      ? { contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", stores: [{ id: "store-1", name: "QA Store", isActive: true }] }
      : { message: "Evaluate unavailable" }), { status: path === "/stores" ? 200 : 503 }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/periods/period-1/publish").set("x-test-user-role", "ADMIN").send({ storeId: "store-1", version: 1 }).expect(503);
    expect(roster.publishPeriod).not.toHaveBeenCalled();
  });

  it("re-fetches and forwards the current official score snapshot when creating a shift", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", generatedAt: "2026-09-07T00:00:00Z", employees: [employee()] }), { status: 200, headers: { "content-type": "application/json" } }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] }).expect(201);
    expect(roster.createShift).toHaveBeenCalledWith(expect.objectContaining({ formalRoleName: "收银", formalRoleColor: "#1e40af", assignments: [expect.objectContaining({ officialScoreSnapshot: 82.4, tierSnapshot: "T2", officialScoreRoundId: "round-1" })] }), "test-user");
  });

  it("rejects an employee without the formal Job grant even when skills match", async () => {
    const unqualified = { ...employee(), positions: [{ id: "different-job", code: "cashier", name: "收银" }],
      skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: ["cashier"] } };
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [unqualified] }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const value = { storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z",
      endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"] };
    await request(app).post("/api/roster/shifts").set(headers).send(value).expect(422);
    await request(app).patch("/api/roster/shifts/shift-1").set(headers).send({ ...value, version: 1 }).expect(422);
    await request(app).post("/api/roster/shifts/draft-commit").set(headers).send({ storeId: "store-1", rosterPeriodId: "period-1",
      changes: [{ kind: "create", clientShiftId: "93fc1014-59eb-471d-b3c1-8c632f48d02a", value: {
        date: value.date, startAt: value.startAt, endAt: value.endAt, breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"],
      } }] }).expect(422);
    expect(roster.createShift).not.toHaveBeenCalled();
    expect(roster.commitDraftPeriod).not.toHaveBeenCalled();
  });

  it("refuses a Shift role absent from the current formal store jobs", async () => {
    const integration = vi.fn(async (path: string) => new Response(JSON.stringify({ contractVersion: "1.4.0", generatedAt: "2026-10-16T00:00:00Z", employees: [employee()], workforceRevision: "r1", pagination: { page: 1, pageSize: path.endsWith("pageSize=1") ? 1 : 100, total: 1, hasMore: false } }), { status: 200 }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/shifts").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1")
      .send({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 0, shiftRoleId: "qa-role", employeeIds: ["employee-1"] })
      .expect(422);
    expect(roster.createShift).not.toHaveBeenCalled();
  });

  it("accepts the generic batch update contract and rejects duplicate items", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0", generatedAt: "2026-10-27T00:00:00.000Z", employees: [employee()] }), { status: 200 }));
    const { app, roster } = setup({ integration });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).post("/api/roster/batch/update").set(headers).send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }], patch: { shiftRoleId: "role-1" } }).expect(200, { updated: 1 });
    expect(roster.batchUpdate).toHaveBeenCalledWith("store-1", [{ id: "shift-1", version: 1 }], { shiftRoleId: "role-1", formalRoleName: "收银", formalRoleColor: "#1e40af" }, "test-user", ["employee-1"], ["role-1"], { "role-1": ["employee-1"] });
    await request(app).post("/api/roster/batch/update").set(headers).send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }], patch: { publicNote: "test" } }).expect(200);
    expect(roster.batchUpdate).toHaveBeenLastCalledWith("store-1", [{ id: "shift-1", version: 1 }], { publicNote: "test" }, "test-user", ["employee-1"], ["role-1"], { "role-1": ["employee-1"] });
    await request(app).post("/api/roster/batch/delete").set(headers).send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }, { id: "shift-1", version: 1 }] }).expect(400);
    expect(roster.batchDelete).not.toHaveBeenCalled();
  });

  it("does not batch-modify shifts when current Evaluate workforce is unavailable", async () => {
    const integration = vi.fn(async () => new Response(JSON.stringify({ message: "Evaluate unavailable" }), { status: 503 }));
    const { app, roster } = setup({ integration });
    await request(app).post("/api/roster/batch/update").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").send({ storeId: "store-1", items: [{ id: "shift-1", version: 1 }], patch: { shiftRoleId: "role-2" } }).expect(503);
    expect(roster.batchUpdate).not.toHaveBeenCalled();
  });

  it("keeps employee CSV free of internal notes and score snapshots", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/roster/export.csv?storeId=store-1&periodId=period-1&audience=employee").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.text).not.toContain("内部");
    expect(response.text).not.toContain("80");
    expect(response.text).toContain("'=危险");
  });

  it("treats whitespace-prefixed and full-width formula-looking export fields as text", async () => {
    const { app, roster } = setup();
    const original = await roster.exportPeriod();
    roster.exportPeriod.mockResolvedValue({ ...original, shifts: [{ ...original.shifts[0],
      roleNameSnapshot: "\t=1+1", publicNote: "  @SUM(1,1)",
      assignments: [{ ...original.shifts[0].assignments[0], employeeNameSnapshot: "＝1+1" }],
    }] });
    const response = await request(app).get("/api/roster/export.csv?storeId=store-1&periodId=period-1&audience=employee")
      .set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.text).toContain('"\'\t=1+1"');
    expect(response.text).toContain('"\'  @SUM(1,1)"');
    expect(response.text).toContain('"\'＝1+1"');
  });

  it("allows manager export only for ADMIN", async () => {
    const { app, roster } = setup();
    await request(app).get("/api/roster/export.csv?storeId=store-1&periodId=period-1&audience=manager").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(403);
    expect(roster.exportPeriod).not.toHaveBeenCalled();
  });

  it("includes internal notes and official snapshots in ADMIN manager export", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/roster/export.csv?storeId=store-1&periodId=period-1&audience=manager").set("x-test-user-role", "ADMIN").expect(200);
    expect(response.text).toContain("内部备注");
    expect(response.text).toContain("内部");
    expect(response.text).toContain("80");
    expect(response.text).toContain("T2");
  });

  it("exports an Adelaide overnight shift in the store timezone for CSV and print", async () => {
    const { app, roster } = setup();
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Adelaide" });
    roster.exportPeriod.mockResolvedValue({
      period: { startDate: "2026-10-05", endDate: "2026-10-11", status: "DRAFT" },
      shifts: [{ date: "2026-10-05", startAt: "2026-10-05T13:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z",
        breakMinutes: 0, roleNameSnapshot: "Front", publicNote: "", internalNote: "",
        assignments: [{ employeeNameSnapshot: "Adelaide Employee", officialScoreSnapshot: "80", tierSnapshot: "T2" }] }],
    });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const csv = await request(app).get("/api/roster/export.csv?storeId=store-1&periodId=period-1&audience=employee").set(headers).expect(200);
    const printed = await request(app).get("/api/roster/print?storeId=store-1&periodId=period-1&audience=employee").set(headers).expect(200);
    for (const body of [csv.text, printed.text]) {
      expect(body).toContain("23:30");
      expect(body).toContain("02:30 (2026-10-06 次日)");
      expect(body).not.toContain("00:00");
    }
    expect(roster.getSettings).toHaveBeenCalledWith("store-1");
  });

  it("rejects current CSV and print without store timezone while preserving frozen publication exports", async () => {
    const { app, roster } = setup();
    roster.getSettings.mockResolvedValue(null);
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    for (const path of ["export.csv", "print"]) {
      const current = await request(app).get(`/api/roster/${path}?storeId=store-1&periodId=period-1&audience=employee`).set(headers).expect(409);
      expect(current.body.message).toContain("门店时区");
      expect(current.headers["content-disposition"]).toBeUndefined();
    }
    const frozen = await roster.exportPublication();
    roster.exportPublication.mockResolvedValue({ ...frozen, timezone: "Australia/Adelaide" });
    await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    roster.exportPublication.mockResolvedValue({ ...frozen, timezone: undefined });
    const legacy = await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    expect(legacy.text).toContain("UTC；原门店时区未知");
  });

  it("exports frozen CSV and print when current store settings cannot be read", async () => {
    const { app, roster } = setup();
    const published = await roster.exportPublication();
    roster.exportPublication.mockResolvedValue({ ...published, timezone: "Australia/Sydney" });
    roster.getSettings.mockRejectedValue(new Error("current settings unavailable"));
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    for (const path of ["export.csv", "print"]) {
      const response = await request(app).get(`/api/roster/${path}?storeId=store-1&publicationId=publication-1&audience=employee`).set(headers).expect(200);
      expect(response.text).toContain("历史员工");
    }
    expect(roster.getSettings).not.toHaveBeenCalled();
  });

  it("uses the frozen publication timezone when current store settings differ", async () => {
    const { app, roster } = setup();
    const published = await roster.exportPublication();
    roster.exportPublication.mockClear();
    roster.exportPublication.mockImplementation(async () => ({ ...published, timezone: "Australia/Adelaide",
      shifts: published.shifts.map((shift) => ({ ...shift, date: "2026-10-05", startAt: "2026-10-05T13:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z" })) }));
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Sydney" });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const csv = await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    const printed = await request(app).get("/api/roster/print?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    for (const body of [csv.text, printed.text]) {
      expect(body).toContain("23:30");
      expect(body).toContain("02:30 (2026-10-06 次日)");
      expect(body).not.toContain("00:00");
    }
  });

  it("labels legacy publication times as UTC without consulting current store timezone", async () => {
    const { app, roster } = setup();
    const published = await roster.exportPublication();
    roster.exportPublication.mockClear();
    roster.exportPublication.mockResolvedValue({ ...published, timezone: undefined,
      shifts: published.shifts.map((shift) => ({ ...shift, date: "2026-10-06", startAt: "2026-10-05T13:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z" })) });
    roster.getSettings.mockResolvedValue({ timezone: "Australia/Adelaide" });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const csv = await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    const printed = await request(app).get("/api/roster/print?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    expect(csv.text).toContain("UTC；原门店时区未知");
    expect(csv.text).toContain('"2026-10-05","13:00","16:00"');
    expect(csv.text).not.toContain("23:30");
    expect(printed.text).toContain("原门店时区未知");
    expect(printed.text).toContain("2026-10-05");
    expect(printed.text).toContain("13:00–16:00 UTC");
  });

  it("distinguishes both repeated 02:30 instants in fall-back CSV and print", async () => {
    const { app, roster } = setup();
    const published = await roster.exportPublication();
    roster.exportPublication.mockResolvedValue({ ...published, timezone: "Australia/Sydney",
      shifts: published.shifts.map((shift) => ({ ...shift, date: "2026-04-05", startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z" })) });
    const headers = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    const csv = await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    const printed = await request(app).get("/api/roster/print?storeId=store-1&publicationId=publication-1&audience=employee").set(headers).expect(200);
    for (const body of [csv.text, printed.text]) {
      expect(body).toContain("02:30 UTC+11");
      expect(body).toContain("02:30 UTC+10");
    }
  });

  it("lists and reads publication revisions only within the authorized store", async () => {
    const { app, roster } = setup();
    const evaluator = { "x-test-user-role": "STORE_EVALUATOR", "x-test-store-id": "store-1" };
    await request(app).get("/api/roster/periods/period-1/publications?storeId=store-1").set(evaluator).expect(200);
    expect(roster.listPublications).toHaveBeenCalledWith("store-1", "period-1");
    await request(app).get("/api/roster/publications/publication-1?storeId=store-1&audience=employee").set(evaluator).expect(200);
    expect(roster.getPublication).toHaveBeenCalledWith("store-1", "publication-1", "employee");
    await request(app).get("/api/roster/publications/publication-1?storeId=store-2&audience=employee").set(evaluator).expect(403);
    await request(app).get("/api/roster/publications/publication-1?storeId=store-1&audience=manager").set(evaluator).expect(403);
  });

  it("exports a selected publication revision rather than the live period", async () => {
    const { app, roster } = setup();
    const response = await request(app).get("/api/roster/export.csv?storeId=store-1&publicationId=publication-1&audience=employee").set("x-test-user-role", "STORE_EVALUATOR").set("x-test-store-id", "store-1").expect(200);
    expect(response.text).toContain("历史员工");
    expect(response.text).not.toContain("历史内部");
    expect(roster.exportPublication).toHaveBeenCalledWith("store-1", "publication-1");
    expect(roster.exportPeriod).not.toHaveBeenCalled();
  });
});

function employee() {
  return { id: "employee-1", displayName: "HandoverEmployee006", employeeType: "REGULAR", employmentType: "PartTime", storeId: "store-1", storeName: "Hurstville", isActive: true, officialScore: { score: 82.4, tier: "T2", roundId: "round-1", closedAt: "2026-09-01T00:00:00Z" }, positions: [{ id: "job-1", code: "cashier", name: "收银" }], skillSummary: { overallPercent: 50, backOfHousePercent: 20, waterBarPercent: 50, frontOfHousePercent: 80, qualifiedSkillCodes: ["cup-labeling"], skills: [{ code: "cup-labeling", nameZh: "贴杯", category: "FRONT_OF_HOUSE", mode: "PROGRESSIVE", status: "Independent", updatedAt: "2026-09-01T00:00:00Z" }], operations: { opening: "UNKNOWN", closing: "CAN_DO", weeklyCleaning: "CANNOT_DO" } } };
}
