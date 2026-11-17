import { afterEach, describe, expect, it, vi } from "vitest";
import { rosterRepository } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import type { CalendarResponse, PeriodSummary, RosterPeriod, ShiftRole, ShiftTemplate } from "../types/roster";
import { loadCalendarSnapshot, scopedCalendarResponse, usableCalendarTemplates } from "./calendarLoad";

afterEach(() => vi.restoreAllMocks());

const period = { id: "period-a", storeId: "store-a", startDate: "2037-10-12", endDate: "2037-10-18", cycleType: "WEEK", status: "DRAFT", version: 1, publishedAt: null } as RosterPeriod;
const calendar = { storeId: "store-a", from: period.startDate, to: period.endDate, periods: [period], shifts: [] } as CalendarResponse;
const summary: PeriodSummary = { period, shiftCount: 0, assignmentCount: 0, totalHours: 0, employeeHours: [], roleHours: [] };

function stubFirstStage() {
  const calendarSpy = vi.spyOn(rosterRepository, "calendar").mockResolvedValue(calendar);
  vi.spyOn(rosterRepository, "roles").mockResolvedValue([]);
  vi.spyOn(rosterRepository, "templates").mockResolvedValue([]);
  vi.spyOn(rosterRepository, "availability").mockResolvedValue([]);
  vi.spyOn(rosterRepository, "settings").mockResolvedValue({ settings: null });
  vi.spyOn(workforceRepository, "employees").mockResolvedValue({ employees: [], contractVersion: "1.4.0", generatedAt: "2037-10-12T00:00:00.000Z" });
  vi.spyOn(workforceRepository, "jobs").mockResolvedValue({ jobs: [] });
  return calendarSpy;
}

describe("loadCalendarSnapshot", () => {
  it("does not wait for the auxiliary template list before displaying the calendar", async () => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "templates").mockReturnValue(new Promise(() => {}));
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const result = await Promise.race([
      loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]);
    expect(result).not.toBe("blocked");
    expect(result && result !== "blocked" ? result.calendar : null).toBe(calendar);
  });

  it("keeps legacy templates for Settings history but excludes them from Calendar creation", async () => {
    stubFirstStage();
    const roles = [
      { id: "legacy", storeId: "store-a", code: "qa-role", nameZh: "验收岗", colorToken: "#334155", requiredSkillCodes: [], isActive: true },
      { id: "formal", storeId: "store-a", code: "water-bar", nameZh: "旧水吧", colorToken: "#334155", requiredSkillCodes: [], isActive: true },
    ] as ShiftRole[];
    const templates = [
      { id: "legacy-template", shiftRoleId: "legacy", isActive: true },
      { id: "formal-template", shiftRoleId: "formal", isActive: true },
      { id: "plain-template", shiftRoleId: null, isActive: true },
      { id: "inactive-plain-template", shiftRoleId: null, isActive: false },
    ] as ShiftTemplate[];
    vi.spyOn(rosterRepository, "roles").mockResolvedValue(roles);
    vi.spyOn(workforceRepository, "jobs").mockResolvedValue({ jobs: [{ id: "job", storeId: "store-a", code: "water-bar", name: "水吧", colorToken: "blue", isActive: true, displayOrder: 1 }] });
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(usableCalendarTemplates(templates, result?.roles ?? []).map((template) => template.id)).toEqual(["formal-template", "plain-template"]);
    expect(result?.roles.map((role) => role.nameZh)).toEqual(["水吧"]);
  });

  it("waits for the period summary before returning a complete current snapshot", async () => {
    const calendarSpy = stubFirstStage();
    let resolveSummary!: (value: PeriodSummary) => void;
    const pendingSummary = new Promise<PeriodSummary>((resolve) => { resolveSummary = resolve; });
    vi.spyOn(rosterRepository, "periodSummary").mockReturnValue(pendingSummary);

    let settled = false;
    const pending = loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true)
      .then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(rosterRepository.periodSummary).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    resolveSummary(summary);

    const result = await pending;
    expect(result?.summary).toBe(summary);
    expect(result?.calendar).toBe(calendar);
    expect(calendarSpy).toHaveBeenCalledTimes(1);
    expect(rosterRepository.availability).not.toHaveBeenCalled();
  });

  it("keeps the Calendar available when the separate Availability endpoint is down", async () => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "availability").mockRejectedValue(new Error("availability unavailable"));
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);

    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.summary).toBe(summary);
    expect(rosterRepository.availability).not.toHaveBeenCalled();
  });

  it.each(["jobs", "employees", "roles"] as const)("keeps shifts visible but withholds edits when %s cannot load", async (endpoint) => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const failure = new Error(`${endpoint} unavailable`);
    if (endpoint === "jobs") vi.spyOn(workforceRepository, "jobs").mockRejectedValue(failure);
    if (endpoint === "employees") vi.spyOn(workforceRepository, "employees").mockRejectedValue(failure);
    if (endpoint === "roles") vi.spyOn(rosterRepository, "roles").mockRejectedValue(failure);

    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);

    expect(result?.calendar).toBe(calendar);
    expect(result?.editContextError).toBe(failure);
    expect(result?.roles).toEqual([]);
    expect(result?.summary).toBeNull();
    expect(rosterRepository.periodSummary).not.toHaveBeenCalled();
  });

  it.each(["jobs", "employees", "roles"] as const)("keeps shifts visible but withholds edits when %s returns an incomplete success body", async (endpoint) => {
    stubFirstStage();
    const summarySpy = vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    if (endpoint === "jobs") vi.spyOn(workforceRepository, "jobs").mockResolvedValue({} as never);
    if (endpoint === "employees") vi.spyOn(workforceRepository, "employees").mockResolvedValue({} as never);
    if (endpoint === "roles") vi.spyOn(rosterRepository, "roles").mockResolvedValue({} as never);

    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.editContextError).toBeInstanceOf(Error);
    expect(result?.roles).toEqual([]);
    expect(result?.workforce.employees).toEqual([]);
    expect(result?.summary).toBeNull();
    expect(summarySpy).not.toHaveBeenCalled();
  });

  it("withholds editing when a successful workforce response contains another store's employee", async () => {
    stubFirstStage();
    const summarySpy = vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    vi.spyOn(workforceRepository, "employees").mockResolvedValue({ employees: [{ id: "other-person", storeId: "store-b", displayName: "Other Store", isActive: true }], generatedAt: "2037-10-12T00:00:00.000Z" } as never);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.editContextError).toBeInstanceOf(Error);
    expect(result?.workforce.employees).toEqual([]);
    expect(summarySpy).not.toHaveBeenCalled();
  });

  it("withholds editing when an employee score cannot be rendered", async () => {
    stubFirstStage();
    vi.spyOn(workforceRepository, "employees").mockResolvedValue({ employees: [{ id: "person-1", storeId: "store-a", displayName: "Employee", isActive: true,
      employeeType: "REGULAR", employmentType: "PartTime", positions: [],
      skillSummary: { qualifiedSkillCodes: [] }, officialScore: { tier: "T2", score: "invalid" } }], generatedAt: "2037-10-12T00:00:00.000Z" } as never);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.editContextError).toBeInstanceOf(Error);
    expect(result?.workforce.employees).toEqual([]);
  });

  it("accepts a complete employee with a custom employment type from Evaluate", async () => {
    stubFirstStage();
    vi.spyOn(workforceRepository, "employees").mockResolvedValue({ employees: [{ id: "person-1", storeId: "store-a", storeName: "Store A", displayName: "Employee", isActive: true,
      employeeType: "REGULAR", employmentType: "FixedTerm", positions: [],
      skillSummary: { overallPercent: null, backOfHousePercent: null, waterBarPercent: null, frontOfHousePercent: null,
        qualifiedSkillCodes: [], skills: [], operations: { opening: "UNKNOWN", closing: "UNKNOWN", weeklyCleaning: "UNKNOWN" } },
      officialScore: null }], generatedAt: "2037-10-12T00:00:00.000Z" } as never);
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.editContextError).toBeNull();
    expect(result?.summary).toBe(summary);
  });

  it("does not display dates with an unverified store timezone", async () => {
    stubFirstStage();
    const failure = new Error("settings unavailable");
    vi.spyOn(rosterRepository, "settings").mockRejectedValue(failure);
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);

    await expect(loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true))
      .rejects.toBe(failure);
    expect(rosterRepository.periodSummary).not.toHaveBeenCalled();
  });

  it("does not display shifts in UTC when a successful settings response omits the settings field", async () => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "settings").mockResolvedValue({} as never);
    const summarySpy = vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    await expect(loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true))
      .rejects.toThrow("门店设置响应不完整");
    expect(summarySpy).not.toHaveBeenCalled();
  });

  it("requests the focused Month period summary instead of the first visible week", async () => {
    stubFirstStage();
    const early = { ...period, id: "early", startDate: "2037-10-05", endDate: "2037-10-11" };
    vi.spyOn(rosterRepository, "calendar").mockResolvedValue({ ...calendar, from: "2037-09-28", to: "2037-11-01", periods: [early, period] });
    const summarySpy = vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const result = await loadCalendarSnapshot("store-a", { from: "2037-09-28", to: "2037-11-01" }, () => true, "2037-10-16");
    expect(summarySpy).toHaveBeenCalledWith("store-a", period.id);
    expect(result?.summary).toBe(summary);
  });

  it("keeps visible shifts while withholding period actions when the summary fails", async () => {
    stubFirstStage();
    const failure = new Error("summary unavailable");
    vi.spyOn(rosterRepository, "periodSummary").mockRejectedValue(failure);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.summary).toBeNull();
    expect(result?.periodShifts).toEqual([]);
    expect(result?.periodContextError).toBe(failure);
  });

  it.each([
    ["missing period", { shiftCount: 0, assignmentCount: 0, totalHours: 0, employeeHours: [], roleHours: [] }],
    ["missing total hours", { ...summary, totalHours: undefined }],
    ["incomplete employee hours", { ...summary, employeeHours: [{ employeeId: "employee-a", hours: 2 }] }],
  ])("keeps visible shifts while withholding period actions for a successful but %s summary", async (_label, response) => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(response as never);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.summary).toBeNull();
    expect(result?.periodShifts).toEqual([]);
    expect(result?.periodContextError).toBeInstanceOf(Error);
  });

  it("keeps the visible range but withholds period actions when the full period cannot be read", async () => {
    const calendarSpy = stubFirstStage();
    const visible = { ...calendar, to: period.startDate };
    const failure = new Error("full period unavailable");
    calendarSpy.mockResolvedValueOnce(visible).mockRejectedValueOnce(failure);
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.startDate }, () => true);
    expect(result?.calendar).toBe(visible);
    expect(result?.summary).toBeNull();
    expect(result?.periodShifts).toEqual([]);
    expect(result?.periodContextError).toBe(failure);
    expect(calendarSpy).toHaveBeenCalledTimes(2);
  });

  it("withholds publication context when the period changed after the visible calendar read", async () => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue({ ...summary, period: { ...period, version: 2 } });
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.summary).toBeNull();
    expect(result?.periodShifts).toEqual([]);
    expect(result?.periodContextError).toBeInstanceOf(Error);
    expect((result?.periodContextError as Error).message).toContain("周期版本");
  });

  it("withholds publication context when the summary changes the cycle without a version change", async () => {
    stubFirstStage();
    vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue({ ...summary, period: { ...period, cycleType: "FORTNIGHT" } });
    const result = await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => true);
    expect(result?.calendar).toBe(calendar);
    expect(result?.summary).toBeNull();
    expect(result?.periodContextError).toBeInstanceOf(Error);
  });

  it("discards a superseded date range before requesting its summary", async () => {
    stubFirstStage();
    const summarySpy = vi.spyOn(rosterRepository, "periodSummary").mockResolvedValue(summary);
    expect(await loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => false)).toBeNull();
    expect(summarySpy).not.toHaveBeenCalled();
  });

  it("discards a superseded date range while its summary is pending", async () => {
    stubFirstStage();
    let resolveSummary!: (value: PeriodSummary) => void;
    vi.spyOn(rosterRepository, "periodSummary").mockReturnValue(new Promise<PeriodSummary>((resolve) => { resolveSummary = resolve; }));
    let current = true;
    const pending = loadCalendarSnapshot("store-a", { from: period.startDate, to: period.endDate }, () => current);
    await vi.waitFor(() => expect(rosterRepository.periodSummary).toHaveBeenCalledOnce());
    current = false;
    resolveSummary(summary);
    expect(await pending).toBeNull();
  });
});

describe("scopedCalendarResponse", () => {
  it("shows a response only under its own store and complete visible date range", () => {
    const range = { from: period.startDate, to: period.endDate };
    expect(scopedCalendarResponse(calendar, "store-a", range)).toBe(calendar);
    expect(scopedCalendarResponse(calendar, "store-b", range)).toBeNull();
    expect(scopedCalendarResponse(calendar, "store-a", { from: period.startDate, to: "2037-10-12" })).toBeNull();
    expect(scopedCalendarResponse(calendar, "store-a", null)).toBeNull();
  });
});
