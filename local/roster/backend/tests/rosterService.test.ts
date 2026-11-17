import { beforeEach, describe, expect, it, vi } from "vitest";
import { RosterService } from "../src/rosterService.js";

const period = { id: "period-1", storeId: "store-1", startDate: new Date("2026-09-07T00:00:00.000Z"), endDate: new Date("2026-09-13T00:00:00.000Z"), cycleType: "WEEK", status: "DRAFT", version: 1, createdByAccountId: "admin", createdAt: new Date(), updatedAt: new Date(), publishedAt: null };

describe("RosterService", () => {
  let db: ReturnType<typeof createDb>;
  let service: RosterService;
  beforeEach(() => { db = createDb(); service = new RosterService(db as never); });

  it("keeps calendar GET behavior read-only", async () => {
    const result = await service.calendar("store-1", "2026-09-07", "2026-09-13");
    expect(result.periods).toHaveLength(1);
    expect(result.shifts).toEqual([]);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(db.rosterPeriod.create).not.toHaveBeenCalled();
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("reads the period version and its shifts in one consistent summary transaction", async () => {
    db.shift.findMany.mockResolvedValue([db.shiftRow] as never);
    const summary = await service.periodSummary("store-1", "period-1");
    expect(summary.period.version).toBe(1);
    expect(summary.shiftCount).toBe(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(db.rosterPeriod.findFirst).toHaveBeenCalledWith({ where: { id: "period-1", storeId: "store-1" } });
    expect(db.shift.findMany).toHaveBeenCalledWith({ where: { storeId: "store-1", rosterPeriodId: "period-1" },
      include: expect.any(Object), orderBy: { startAt: "asc" } });
  });

  it("refuses to place legacy shifts on a store-local day without timezone settings", async () => {
    db.shift.findMany.mockResolvedValue([db.shiftRow] as never);
    db.rosterStoreSettings.findUnique.mockResolvedValue(null);
    await expect(service.calendar("store-1", "2026-09-07", "2026-09-07"))
      .rejects.toMatchObject({ status: 409, message: "请先核对门店时区，再查看历史班次" });
  });

  it("retrieves a moved shift by ID with store scope and reports deletion only on 404", async () => {
    const shift = await service.getShift("store-1", "shift-1");
    expect(shift).toMatchObject({ id: "shift-1", storeId: "store-1", date: "2026-09-07" });
    expect(db.shift.findFirst).toHaveBeenCalledWith({ where: { id: "shift-1", storeId: "store-1" }, include: expect.any(Object) });
    db.shift.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.getShift("store-1", "deleted-shift")).rejects.toMatchObject({ status: 404 });
  });

  it("scopes assignable roles to active global and current-store rows", async () => {
    await service.listRoles("store-1");
    expect(db.shiftRole.findMany).toHaveBeenCalledWith({
      where: { isActive: true, OR: [{ storeId: null }, { storeId: "store-1" }] },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { nameZh: "asc" }],
    });
  });

  it("allows settings to request inactive roles without changing store scope", async () => {
    await service.listRoles("store-1", true);
    expect(db.shiftRole.findMany).toHaveBeenCalledWith({
      where: { OR: [{ storeId: null }, { storeId: "store-1" }] },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { nameZh: "asc" }],
    });
  });

  it("returns the shift-template row from its own version-checked write", async () => {
    const saved = { id: "template-1", storeId: "store-1", name: "早班", version: 2, shiftRole: null };
    db.shiftTemplate.update.mockResolvedValue(saved);
    const result = await service.updateShiftTemplate("template-1", { storeId: "store-1", name: " 早班 ",
      startTime: "10:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: null,
      isActive: true, displayOrder: 0, version: 1 });
    expect(db.shiftTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1", storeId: "store-1", version: 1 },
      data: { name: "早班", startTime: "10:00", endTime: "17:00", breakMinutes: 30,
        shiftRoleId: null, isActive: true, displayOrder: 0, version: { increment: 1 } },
      include: { shiftRole: true },
    });
    expect(result).toBe(saved);
  });

  it("retires a template with its legacy role unchanged and rejects a new role while retiring", async () => {
    db.shiftTemplate.findFirst.mockResolvedValue({ id: "template-1", storeId: "store-1", version: 1, shiftRoleId: "legacy-role" } as never);
    db.shiftTemplate.update.mockResolvedValue({ id: "template-1", storeId: "store-1", isActive: false, version: 2 });
    const input = { storeId: "store-1", name: "Legacy shift", startTime: "10:00", endTime: "17:00",
      breakMinutes: 30, shiftRoleId: "legacy-role", isActive: false, displayOrder: 0, version: 1 };

    await expect(service.updateShiftTemplate("template-1", input)).resolves.toMatchObject({ isActive: false });
    expect(db.shiftRole.findFirst).not.toHaveBeenCalled();
    await expect(service.updateShiftTemplate("template-1", { ...input, shiftRoleId: "other-role" }))
      .rejects.toMatchObject({ status: 400 });
    expect(db.shiftTemplate.update).toHaveBeenCalledTimes(1);
  });

  it("accepts an overnight shift template and rejects a zero-length template", async () => {
    await expect(service.createShiftTemplate({ storeId: "store-1", name: "晚班", startTime: "18:00",
      endTime: "02:00", breakMinutes: 30 })).resolves.toBeDefined();
    expect(db.shiftTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startTime: "18:00", endTime: "02:00", breakMinutes: 30 }),
    }));
    await expect(service.createShiftTemplate({ storeId: "store-1", name: "无效", startTime: "18:00",
      endTime: "18:00", breakMinutes: 0 })).rejects.toMatchObject({ status: 400 });
    expect(db.shiftTemplate.create).toHaveBeenCalledTimes(1);
  });

  it("returns the availability-template row from its own version-checked write", async () => {
    const slots = [{ dayOffset: 0, status: "AVAILABLE", startTime: "10:00", endTime: "17:00" }];
    const saved = { id: "availability-1", storeId: "store-1", name: "全天", version: 2, slots };
    db.availabilityTemplate.update.mockResolvedValue(saved);
    const result = await service.updateAvailabilityTemplate("availability-1", { storeId: "store-1",
      name: " 全天 ", slots, isActive: true, displayOrder: 0, version: 1 });
    expect(db.availabilityTemplate.update).toHaveBeenCalledWith({
      where: { id: "availability-1", storeId: "store-1", version: 1 },
      data: { name: "全天", slots, isActive: true, displayOrder: 0, version: { increment: 1 } },
    });
    expect(result).toBe(saved);
  });

  it("reports an expired template version as a conflict", async () => {
    db.shiftTemplate.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(service.updateShiftTemplate("template-1", { storeId: "store-1", name: "早班",
      startTime: "10:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: null,
      isActive: true, displayOrder: 0, version: 1 })).rejects.toMatchObject({ status: 409 });
    db.availabilityTemplate.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(service.updateAvailabilityTemplate("availability-1", { storeId: "store-1",
      name: "全天", slots: [], isActive: true, displayOrder: 0, version: 1 }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("reports duplicate template names as conflicts instead of server errors", async () => {
    db.shiftTemplate.update.mockRejectedValueOnce({ code: "P2002" });
    await expect(service.updateShiftTemplate("template-1", { storeId: "store-1", name: "已存在",
      startTime: "10:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: null,
      isActive: true, displayOrder: 0, version: 1 }))
      .rejects.toMatchObject({ status: 409, message: "该门店已存在同名班次模板" });
    db.availabilityTemplate.update.mockRejectedValueOnce({ code: "P2002" });
    await expect(service.updateAvailabilityTemplate("availability-1", { storeId: "store-1",
      name: "已存在", slots: [], isActive: true, displayOrder: 0, version: 1 }))
      .rejects.toMatchObject({ status: 409, message: "该门店已存在同名可用时间模板" });
  });

  it("rejects invalid period length before writing", async () => {
    await expect(service.createPeriod({ storeId: "store-1", startDate: "2026-09-07", endDate: "2026-09-12", cycleType: "WEEK" }, "admin")).rejects.toMatchObject({ status: 400 });
    expect(db.rosterPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a non-overlapping weekly period and rejects an overlapping one", async () => {
    db.rosterPeriod.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.createPeriod({ storeId: "store-1", startDate: "2026-09-14", endDate: "2026-09-20", cycleType: "WEEK" }, "admin")).resolves.toMatchObject({ id: "period-1" });
    expect(db.rosterPeriod.create).toHaveBeenCalledOnce();
    await expect(service.createPeriod({ storeId: "store-1", startDate: "2026-09-07", endDate: "2026-09-13", cycleType: "WEEK" }, "admin")).rejects.toMatchObject({ status: 409 });
  });

  it("creates a shift with role snapshots", async () => {
    db.employeeAvailability.findMany.mockResolvedValueOnce([{ employeeId: "employee-1", status: "AVAILABLE", startAt: new Date("2026-09-06T22:00:00.000Z"), endAt: new Date("2026-09-07T02:00:00.000Z") }] as never);
    const shift = await service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", formalRoleColor: "#1e40af", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 82.4, tierSnapshot: "T2", officialScoreRoundId: "round-1", officialScoreClosedAt: "2026-09-06T00:00:00.000Z" }] }, "admin");
    expect(shift.roleNameSnapshot).toBe("前场");
    expect(db.shift.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store-1", roleColorSnapshot: "#1e40af" }) }));
    expect(db.$executeRaw).toHaveBeenCalledTimes(2); // Store-period lock, then employee lock.
  });

  it("refuses a Day shift before the store timezone is configured", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue(null);
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1",
      date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z",
      breakMinutes: 30, shiftRoleId: "role-1", assignments: [currentAssignment("HandoverEmployee006")] }, "admin"))
      .rejects.toMatchObject({ status: 409, message: "请先在设置中保存门店时区，再创建或修改班次" });
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("rejects a shift without registered available time before writing", async () => {
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "admin")).rejects.toMatchObject({ status: 422 });
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("rechecks employee conflicts after taking the advisory lock", async () => {
    db.employeeAvailability.findMany.mockResolvedValueOnce([{ employeeId: "employee-1", status: "AVAILABLE", startAt: new Date("2026-09-06T22:00:00.000Z"), endAt: new Date("2026-09-07T02:00:00.000Z") }] as never);
    db.shiftAssignment.findFirst.mockResolvedValueOnce({ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", shift: { storeId: "other-store", startAt: new Date("2026-09-06T23:30:00Z"), endAt: new Date("2026-09-07T01:30:00Z") } } as never);
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 82.4, tierSnapshot: "T2", officialScoreRoundId: "round-1", officialScoreClosedAt: "2026-09-06T00:00:00.000Z" }] }, "admin")).rejects.toMatchObject({ status: 409, validation: { code: "CROSS_STORE_CONFLICT", employeeId: "employee-1" } });
    expect(db.$executeRaw).toHaveBeenCalledTimes(2); // Store-period lock, then employee lock.
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("allows shift creation regardless of legacy publication state with availability checked", async () => {
    db.rosterPeriod.findFirst.mockResolvedValue({ ...period, status: "PUBLISHED" });
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", assignments: [currentAssignment("HandoverEmployee006")] }, "admin")).resolves.toMatchObject({ id: "shift-1" });
    expect(db.shift.create).toHaveBeenCalledOnce();
  });

  it("rechecks the target period date range inside the shift create transaction", async () => {
    const movedPeriod = { ...period, startDate: new Date("2026-09-14T00:00:00.000Z"),
      endDate: new Date("2026-09-20T00:00:00.000Z"), version: 2 };
    db.rosterPeriod.findFirst.mockResolvedValueOnce(period).mockResolvedValueOnce(movedPeriod);
    db.employeeAvailability.findMany.mockResolvedValueOnce([{
      employeeId: "employee-1", status: "AVAILABLE", startAt: new Date("2026-09-06T22:00:00.000Z"),
      endAt: new Date("2026-09-07T02:00:00.000Z"),
    }] as never);
    await expect(service.createShift({
      storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07",
      startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z",
      breakMinutes: 30, shiftRoleId: "role-1", assignments: [currentAssignment("HandoverEmployee006")],
    }, "admin")).rejects.toMatchObject({ status: 409, validation: { code: "TARGET_PERIOD_CONFLICT" } });
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("enforces the configured minimum duration and operating window on the server", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue({ storeId: "store-1", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", minimumShiftMinutes: 60 } as never);
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-06T23:30:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "admin")).rejects.toMatchObject({ status: 400, message: "班次不能短于 60 分钟" });
    await expect(service.createShift({ storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T22:00:00.000Z", endAt: "2026-09-06T23:00:00.000Z", breakMinutes: 0, shiftRoleId: "role-1", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "admin")).rejects.toMatchObject({ status: 400, message: "班次时间必须在门店营业时段 09:00-22:00 内" });
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("rejects stale shift updates with 409", async () => {
    db.shift.findFirst.mockResolvedValueOnce(db.shiftRow).mockResolvedValueOnce({ version: 2, rosterPeriod: { status: "DRAFT" } } as never);
    await expect(service.updateShift("shift-1", { storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", version: 1, assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 82.4, tierSnapshot: "T2", officialScoreRoundId: "round-1", officialScoreClosedAt: "2026-09-06T00:00:00.000Z" }] }, "admin")).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
  });

  it("rechecks the target period date range inside the shift update transaction", async () => {
    const movedPeriod = { ...period, startDate: new Date("2026-09-14T00:00:00.000Z"),
      endDate: new Date("2026-09-20T00:00:00.000Z"), version: 2 };
    db.rosterPeriod.findFirst.mockResolvedValueOnce(period).mockResolvedValueOnce(movedPeriod);
    db.shift.findFirst.mockResolvedValueOnce(db.shiftRow).mockResolvedValueOnce({
      version: 1, rosterPeriodId: period.id, rosterPeriod: { status: "DRAFT" },
    } as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([{
      employeeId: "employee-1", status: "AVAILABLE", startAt: new Date("2026-09-06T22:00:00.000Z"),
      endAt: new Date("2026-09-07T02:00:00.000Z"),
    }] as never);
    await expect(service.updateShift("shift-1", {
      storeId: "store-1", rosterPeriodId: "period-1", date: "2026-09-07",
      startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z",
      breakMinutes: 30, shiftRoleId: "role-1", version: 1,
      assignments: [currentAssignment("HandoverEmployee006")],
    }, "admin")).rejects.toMatchObject({ status: 409, validation: { code: "TARGET_PERIOD_CONFLICT" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
    expect(db.shiftAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects publishing an empty period", async () => {
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [] } as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "Hurstville" }, [])).rejects.toMatchObject({ status: 422 });
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing a draft with a role absent from current formal jobs", async () => {
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [currentAssignment("QA Employee")] }] } as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")], []))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE" } });
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing an unqualified assigned employee before any write", async () => {
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [currentAssignment("QA Employee")] }] } as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" },
      { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")], ["role-1"], { "role-1": "Cashier" }, { "role-1": [] }))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: "employee-1" } });
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing a draft whose assigned employee is no longer active in the store", async () => {
    const assignment = { id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Former Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [assignment] }] } as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "Hurstville" }, [])).rejects.toMatchObject({ status: 422, validation: { code: "ARCHIVED_EMPLOYEE" } });
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing a draft when an assigned shift lacks current availability", async () => {
    const assignment = { id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [assignment] }] } as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")])).rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId: "employee-1" } });
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing overlapping assignments even if they came from an older write path", async () => {
    const assignment = { id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [
      { ...db.shiftRow, assignments: [assignment] },
      { ...db.shiftRow, id: "shift-2", startAt: new Date("2026-09-07T00:00:00.000Z"), endAt: new Date("2026-09-07T02:00:00.000Z"), assignments: [{ ...assignment, id: "assignment-2" }] },
    ] } as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")])).rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_OVERLAP", employeeId: "employee-1" } });
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("rejects publishing an assignment that overlaps a shift in another store", async () => {
    const assignment = { id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [assignment] }] } as never);
    db.shiftAssignment.findMany.mockResolvedValueOnce([{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee", shift: { id: "other-shift", storeId: "other-store", startAt: new Date("2026-09-06T23:30:00.000Z"), endAt: new Date("2026-09-07T00:30:00.000Z") } }] as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    await expect(service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")])).rejects.toMatchObject({ status: 409, validation: { code: "CROSS_STORE_CONFLICT", employeeId: "employee-1" } });
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPublication.create).not.toHaveBeenCalled();
  });

  it("does not carry an old assignment score into a new publication without a CLOSED score", async () => {
    const assignment = { id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Old Name", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 88, tierSnapshot: "T2", officialScoreRoundId: "old-closed", officialScoreClosedAt: new Date("2026-09-01T00:00:00.000Z") };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [{ ...db.shiftRow, assignments: [assignment] }] } as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    await service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("Current Name")]);
    const snapshot = db.rosterPublication.create.mock.calls[0]?.[0]?.data.snapshot as { shifts: Array<{ assignments: Array<{ employeeNameSnapshot: string; officialScoreSnapshot: number | null; tierSnapshot: string | null }> }> };
    expect(snapshot.shifts[0]?.assignments[0]).toMatchObject({ employeeNameSnapshot: "Current Name", officialScoreSnapshot: null, tierSnapshot: null });
  });

  it("builds the publication snapshot from data read inside its transaction", async () => {
    let currentNote = "before concurrent edit";
    const assignment = { id: "assignment-1", shiftId: "shift-1", employeeId: "employee-1", employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null, createdAt: new Date() };
    db.rosterPeriod.findFirst.mockImplementation(async () => ({ ...period, shifts: [{ ...db.shiftRow, publicNote: currentNote, assignments: [assignment] }] }) as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    db.$transaction.mockImplementation(async (callback) => { currentNote = "committed concurrent edit"; return callback(db as never); });
    db.rosterPublication.create.mockImplementation(async ({ data }) => ({ id: "publication-1", ...data }) as never);
    await service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin" }, { id: "store-1", name: "QA Store" }, [currentAssignment("QA Employee")]);
    const saved = db.rosterPublication.create.mock.calls[0]?.[0]?.data.snapshot as { shifts: Array<{ publicNote: string }> };
    expect(saved.shifts[0]?.publicNote).toBe("committed concurrent edit");
  });

  it("reads and exports immutable publication snapshots instead of live shift rows", async () => {
    const assignedShift = { ...db.shiftRow, assignments: [{ id: "a1", shiftId: "shift-1", employeeId: "employee-1", employeeNameSnapshot: "Original Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 88, tierSnapshot: "T2", officialScoreRoundId: "round-1", officialScoreClosedAt: new Date("2026-09-01T00:00:00.000Z"), createdAt: new Date() }] };
    db.rosterPeriod.findFirst.mockResolvedValueOnce({ ...period, shifts: [assignedShift] } as never);
    db.employeeAvailability.findMany.mockResolvedValueOnce([availableWindow()] as never);
    db.rosterPublication.create.mockImplementationOnce(async ({ data }) => ({ id: "publication-1", publishedAt: data.publishedAt, ...data }));
    await service.publishPeriod("store-1", "period-1", 1, { accountId: "admin", displayName: "Admin Person" }, { id: "store-1", name: "Hurstville" }, [currentAssignment("Original Employee", 88)]);
    const savedSnapshot = structuredClone(db.rosterPublication.create.mock.calls[0]![0].data.snapshot);
    expect(savedSnapshot.shifts[0].assignments[0].employeeNameSnapshot).toBe("Original Employee");
    expect(savedSnapshot.shifts[0].roleNameSnapshot).toBe("前场");

    const publicationRow = { id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2, publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"), snapshot: savedSnapshot, rosterPeriod: { ...period, version: 99 } };
    db.rosterPublication.findFirst.mockResolvedValue(publicationRow as never);
    db.shiftRow.roleNameSnapshot = "Changed Live Role";
    const employeeView = await service.getPublication("store-1", "publication-1", "employee");
    const employeeShift = employeeView.snapshot.shifts[0]!;
    expect(employeeShift.roleNameSnapshot).toBe("前场");
    expect(employeeShift.assignments[0]).not.toHaveProperty("officialScoreSnapshot");
    expect(employeeShift).not.toHaveProperty("internalNote");
    const managerView = await service.getPublication("store-1", "publication-1", "manager");
    expect(managerView.snapshot.shifts[0]?.assignments[0]?.officialScoreSnapshot).toBe(88);
    const exported = await service.exportPublication("store-1", "publication-1");
    expect(exported.shifts[0]?.assignments[0]?.employeeNameSnapshot).toBe("Original Employee");
  });

  it.each([
    ["snapshot store", (snapshot: Record<string, unknown>) => { snapshot.store = { id: "other-store", name: "Other Store" }; }],
    ["snapshot period", (snapshot: Record<string, unknown>) => { snapshot.period = { id: "other-period", storeId: "store-1" }; }],
    ["shift store", (snapshot: Record<string, unknown>) => { (snapshot.shifts as Array<Record<string, unknown>>)[0]!.storeId = "other-store"; }],
    ["shift period", (snapshot: Record<string, unknown>) => { (snapshot.shifts as Array<Record<string, unknown>>)[0]!.rosterPeriodId = "other-period"; }],
  ])("rejects a publication with mismatched %s scope", async (_label, corrupt) => {
    const snapshot: Record<string, unknown> = {
      store: { id: "store-1", name: "QA Store" },
      period: { id: "period-1", storeId: "store-1", startDate: "2026-09-07", endDate: "2026-09-13", version: 2 },
      shifts: [{ id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z", breakMinutes: 30,
        roleNameSnapshot: "Front", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }],
    };
    corrupt(snapshot);
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot, rosterPeriod: period,
    } as never);
    await expect(service.getPublication("store-1", "publication-1", "employee"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("发布快照") });
    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("发布快照") });
  });

  it.each([
    ["nested start date", (snapshot: Record<string, unknown>) => { (snapshot.period as Record<string, unknown>).startDate = "2026-09-08"; }],
    ["root end date", (snapshot: Record<string, unknown>) => { snapshot.endDate = "2026-09-14"; }],
    ["cycle type", (snapshot: Record<string, unknown>) => { (snapshot.period as Record<string, unknown>).cycleType = "FORTNIGHT"; }],
  ])("rejects a publication with mismatched %s", async (_label, corrupt) => {
    const snapshot: Record<string, unknown> = {
      store: { id: "store-1", name: "QA Store" },
      period: { id: "period-1", storeId: "store-1", startDate: "2026-09-07", endDate: "2026-09-13", cycleType: "WEEK" },
      shifts: [{ id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z", breakMinutes: 30,
        roleNameSnapshot: "Front", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }],
    };
    corrupt(snapshot);
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot, rosterPeriod: period,
    } as never);
    await expect(service.getPublication("store-1", "publication-1", "employee"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("排班周期") });
    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("排班周期") });
  });

  it.each(["Invalid/Timezone", 123, null])("rejects an archived publication with an explicit invalid timezone (%s)", async (timezone) => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { timezone, shifts: [{ id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z", breakMinutes: 30,
        roleNameSnapshot: "Front", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }] },
      rosterPeriod: period,
    } as never);
    await expect(service.getPublication("store-1", "publication-1", "employee"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("时区") });
    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("时区") });
  });

  it("keeps a legacy publication without a timezone readable for explicit UTC export", async () => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { shifts: [{ id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z", breakMinutes: 30,
        roleNameSnapshot: "Front", assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }] },
      rosterPeriod: period,
    } as never);
    const exported = await service.exportPublication("store-1", "publication-1");
    expect(exported.timezone).toBeUndefined();
    expect(exported.shifts).toHaveLength(1);
  });

  it("refuses to export a publication when a saved shift is incomplete", async () => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { shifts: [{ id: "shift-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", assignments: [] }] },
      rosterPeriod: period,
    } as never);

    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("发布快照") });
  });

  it("refuses to omit a published shift whose employee assignments are missing", async () => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { shifts: [{ id: "shift-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z", assignments: [] }] },
      rosterPeriod: period,
    } as never);

    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("发布快照") });
  });

  it("refuses to replace a missing archived employee name with a fabricated label", async () => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { shifts: [{ id: "shift-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z",
        assignments: [{ id: "assignment-1", employeeId: "employee-1" }] }] },
      rosterPeriod: period,
    } as never);

    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("缺少员工身份信息") });
  });

  it.each([
    { field: "breakMinutes", missing: { roleNameSnapshot: "Front" }, expected: "休息时间" },
    { field: "roleNameSnapshot", missing: { breakMinutes: 30 }, expected: "岗位名称" },
  ])("refuses to invent archived $field", async ({ missing, expected }) => {
    db.rosterPublication.findFirst.mockResolvedValue({
      id: "publication-1", rosterPeriodId: "period-1", periodVersion: 2,
      publishedByAccountId: "admin", publishedAt: new Date("2026-09-06T08:00:00.000Z"),
      snapshot: { shifts: [{ id: "shift-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z",
        shiftRoleId: "role-1", ...missing,
        assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }] },
      rosterPeriod: period,
    } as never);

    await expect(service.exportPublication("store-1", "publication-1"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining(expected) });
  });

  it("validates store settings and rejects stale versions", async () => {
    const settings = { storeId: "store-1", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 15, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10 };
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 400 });
    expect(db.rosterStoreSettings.findUnique).not.toHaveBeenCalled();
    db.rosterStoreSettings.findUnique.mockResolvedValueOnce({ ...settings, minimumShiftMinutes: 60, version: 2 } as never);
    await expect(service.saveSettings({ ...settings, minimumShiftMinutes: 60, version: 1 })).rejects.toMatchObject({ status: 409 });
    expect(db.rosterStoreSettings.update).not.toHaveBeenCalled();
  });

  it("clears a hidden fortnight anchor when switching to a weekly cycle", async () => {
    const settings = { storeId: "store-1", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30,
      weekStartsOn: 0, cycleType: "WEEK" as const, fortnightAnchorDate: "2026-09-28",
      weeklyHourWarning: 38, dailyHourWarning: 10, version: 1 };
    db.rosterStoreSettings.findUnique.mockResolvedValue({ ...settings, cycleType: "FORTNIGHT", weekStartsOn: 1 } as never);

    await expect(service.saveSettings(settings)).resolves.toBeDefined();
    expect(db.rosterStoreSettings.updateMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", version: 1 },
      data: expect.objectContaining({ cycleType: "WEEK", weekStartsOn: 0, fortnightAnchorDate: null }),
    });
  });

  it("rejects an invalid store timezone and an unusable default break", async () => {
    const settings = { storeId: "store-1", timezone: "Invalid/Timezone", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10 };
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 400, message: "门店时区无效" });
    await expect(service.saveSettings({ ...settings, timezone: "Australia/Sydney", defaultBreakMinutes: 60 })).rejects.toMatchObject({ status: 400, message: "默认休息时间必须短于最短班次" });
    expect(db.rosterStoreSettings.create).not.toHaveBeenCalled();
  });

  it("rejects changing a store timezone once shifts exist without writing settings", async () => {
    const settings = { storeId: "store-1", timezone: "UTC", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10, version: 1 };
    db.rosterStoreSettings.findUnique.mockResolvedValue({ ...settings, timezone: "Australia/Sydney" } as never);
    db.shift.count.mockResolvedValue(1);
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 409, validation: { code: "STORE_TIMEZONE_LOCKED" } });
    expect(db.rosterStoreSettings.create).not.toHaveBeenCalled();
    expect(db.rosterStoreSettings.updateMany).not.toHaveBeenCalled();
  });

  it("rejects changing a store timezone once availability exists, including first settings save", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue(null);
    const settings = { storeId: "store-1", timezone: "UTC", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10 };
    db.employeeAvailability.count.mockResolvedValue(1);
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 409, validation: { code: "STORE_TIMEZONE_LOCKED" } });
    expect(db.rosterStoreSettings.create).not.toHaveBeenCalled();
  });

  it("writes store settings only when the version still matches under the store lock", async () => {
    const settings = { storeId: "store-1", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10, version: 1 };
    db.rosterStoreSettings.findUnique.mockResolvedValue({ ...settings } as never);
    db.rosterStoreSettings.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(db.rosterStoreSettings.create).not.toHaveBeenCalled();
  });

  it.each([
    ["09:00", "22:00", 900],
    ["18:00", "02:00", 510],
  ])("rejects a minimum longer than %s-%s operating hours without changing settings", async (openingTime, closingTime, minimumShiftMinutes) => {
    const settings = { storeId: "store-1", timezone: "Australia/Sydney", openingTime, closingTime, slotIntervalMinutes: 30,
      minimumShiftMinutes, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const,
      weeklyHourWarning: 38, dailyHourWarning: 10, version: 1 };
    await expect(service.saveSettings(settings)).rejects.toMatchObject({ status: 400 });
    expect(db.rosterStoreSettings.create).not.toHaveBeenCalled();
    expect(db.rosterStoreSettings.updateMany).not.toHaveBeenCalled();
  });

  it("replaces multiple availability slots and clears every requested date with zero slots", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue({ timezone: "UTC" } as never);
    const rows = [
      { date: "2026-09-07", status: "AVAILABLE" as const, startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T13:00:00.000Z", source: "MANUAL" as const },
      { date: "2026-09-07", status: "AVAILABLE" as const, startAt: "2026-09-07T17:00:00.000Z", endAt: "2026-09-07T22:00:00.000Z", source: "TEMPLATE" as const },
    ];
    await service.replaceAvailability({ storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07", "2026-09-08"], entries: rows });
    expect(db.employeeAvailability.deleteMany).toHaveBeenCalledWith({ where: { storeId: "store-1", employeeId: "employee-1", date: { in: [new Date("2026-09-07T00:00:00.000Z"), new Date("2026-09-08T00:00:00.000Z")] } } });
    expect(db.employeeAvailability.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ source: "MANUAL" }), expect.objectContaining({ source: "TEMPLATE" })]) });
    expect(db.$executeRaw).toHaveBeenCalledTimes(2); // Store timezone and employee availability serialize.
  });

  it("rejects timed availability until the store timezone is configured", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue(null);
    await expect(service.replaceAvailability({
      storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"],
      entries: [{ date: "2026-09-07", status: "AVAILABLE",
        startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z" }],
    })).rejects.toMatchObject({ status: 409, message: "请先在设置中保存门店时区，再设置可用时间" });
    expect(db.employeeAvailability.deleteMany).not.toHaveBeenCalled();
    expect(db.employeeAvailability.createMany).not.toHaveBeenCalled();
  });

  it("rejects UNKNOWN availability before timezone setup so Adelaide remains configurable", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue(null);
    await expect(service.replaceAvailability({ storeId: "store-1", employeeId: "employee-1",
      dates: ["2026-09-07"], entries: [{ date: "2026-09-07", status: "UNKNOWN" }] }))
      .rejects.toMatchObject({ status: 409 });
    expect(db.employeeAvailability.createMany).not.toHaveBeenCalled();
  });

  it("rejects availability whose timestamp belongs to another store-local date before writing", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue({ timezone: "Australia/Sydney" } as never);
    await expect(service.replaceAvailability({
      storeId: "store-1", employeeId: "employee-1", dates: ["2026-10-05"],
      entries: [{ date: "2026-10-05", status: "AVAILABLE", startAt: "2026-10-05T16:00:00.000Z", endAt: "2026-10-05T17:00:00.000Z" }],
    })).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_AVAILABILITY_DATE", employeeId: "employee-1" } });
    expect(db.employeeAvailability.deleteMany).not.toHaveBeenCalled();
    expect(db.employeeAvailability.createMany).not.toHaveBeenCalled();
  });

  it("rejects overlapping availability slots but allows adjacent slots", async () => {
    db.rosterStoreSettings.findUnique.mockResolvedValue({ timezone: "UTC" } as never);
    const base = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"] };
    await expect(service.replaceAvailability({ ...base, entries: [
      { date: "2026-09-07", status: "AVAILABLE", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T14:00:00.000Z" },
      { date: "2026-09-07", status: "AVAILABLE", startAt: "2026-09-07T13:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400, message: "可用时间段不能重叠，包括跨日时段" });
    await expect(service.replaceAvailability({ ...base, entries: [
      { date: "2026-09-07", status: "AVAILABLE", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T13:00:00.000Z" },
      { date: "2026-09-07", status: "AVAILABLE", startAt: "2026-09-07T13:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z" },
    ] })).resolves.toEqual([]);
  });

  it("rejects contradictory UNKNOWN availability rows before replacing a day", async () => {
    const base = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-09-07"] };
    await expect(service.replaceAvailability({ ...base, entries: [
      { date: "2026-09-07", status: "UNKNOWN", startAt: null, endAt: null },
      { date: "2026-09-07", status: "AVAILABLE", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400 });
    await expect(service.replaceAvailability({ ...base, entries: [
      { date: "2026-09-07", status: "UNKNOWN", startAt: null, endAt: null },
      { date: "2026-09-07", status: "UNKNOWN", startAt: null, endAt: null },
    ] })).rejects.toMatchObject({ status: 400 });
    await expect(service.replaceAvailability({ ...base, entries: [
      { date: "2026-09-07", status: "UNKNOWN", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T17:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400 });
    expect(db.employeeAvailability.deleteMany).not.toHaveBeenCalled();
    expect(db.employeeAvailability.createMany).not.toHaveBeenCalled();
  });

  it("deletes a current shift in a legacy published period using its version", async () => {
    db.shift.findFirst.mockResolvedValueOnce({ ...db.shiftRow, rosterPeriod: { status: "PUBLISHED" } } as never);
    await expect(service.deleteShift("shift-1", "store-1", 1)).resolves.toBeUndefined();
    expect(db.shift.deleteMany).toHaveBeenCalledWith({ where: { id: "shift-1", storeId: "store-1", version: 1 } });
  });

  it("allows batch deletion of current shifts regardless of legacy publication state", async () => {
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: { status: "PUBLISHED" } }] as never);
    await expect(service.batchDelete("store-1", [{ id: "shift-1", version: 1 }])).resolves.toEqual({ deleted: 1 });
    expect(db.shift.deleteMany).toHaveBeenCalledOnce();
    expect(db.rosterPeriod.updateMany).toHaveBeenCalledOnce();
  });

  it("still rejects a stale deletion in a legacy published period", async () => {
    db.shift.findFirst.mockResolvedValueOnce({ ...db.shiftRow, rosterPeriod: { status: "PUBLISHED" } } as never);
    db.shift.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.deleteShift("shift-1", "store-1", 1)).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
  });

  it("runs batch updates in one transaction and rejects a stale member", async () => {
    const second = { ...db.shiftRow, id: "shift-2" };
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: period, assignments: [] }, { ...second, rosterPeriod: period, assignments: [] }] as never);
    db.shift.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.batchUpdate("store-1", [{ id: "shift-1", version: 1 }, { id: "shift-2", version: 1 }], { shiftRoleId: "role-1" }, "admin", ["employee-1"])).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
  });

  it("stores the current formal job color on a batch role change", async () => {
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: period, assignments: [] }] as never);
    await service.batchUpdate("store-1", [{ id: "shift-1", version: 1 }],
      { shiftRoleId: "role-1", formalRoleName: "收银", formalRoleColor: "#1e40af" }, "admin", [], ["role-1"]);
    expect(db.shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftRoleId: "role-1", roleNameSnapshot: "收银", roleColorSnapshot: "#1e40af" }),
    }));
  });

  it("rejects a batch change when a saved assignee is no longer active in this store", async () => {
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: { status: "DRAFT" }, assignments: [{ employeeId: "employee-archived", employeeNameSnapshot: "Former Employee" }] }] as never);
    await expect(service.batchUpdate("store-1", [{ id: "shift-1", version: 1 }], { shiftRoleId: "role-1" }, "admin", ["employee-1"])).rejects.toMatchObject({ status: 422, validation: { code: "ARCHIVED_EMPLOYEE", employeeId: "employee-archived" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a batch role change when its employee lacks the formal grant", async () => {
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: period,
      assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] }] as never);
    await expect(service.batchUpdate("store-1", [{ id: "shift-1", version: 1 }], { shiftRoleId: "role-1" },
      "admin", ["employee-1"], ["role-1"], { "role-1": [] }))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: "employee-1" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a date move for a legacy role absent from current formal jobs before writing", async () => {
    db.shift.findFirst.mockResolvedValueOnce({ ...db.shiftRow, rosterPeriod: period } as never);
    await expect(service.repositionShift("shift-1", {
      storeId: "store-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z",
      version: 1, targetStartDate: "2026-09-07", targetEndDate: "2026-09-13",
    }, "admin", ["employee-1"], undefined, {})).rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE", shiftId: "shift-1" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
  });

  it("rejects moving an existing assignment after its formal grant is removed", async () => {
    db.shift.findFirst.mockResolvedValueOnce({ ...db.shiftRow, rosterPeriod: period,
      assignments: [{ employeeId: "employee-1", employeeNameSnapshot: "QA Employee" }] } as never);
    await expect(service.repositionShift("shift-1", {
      storeId: "store-1", date: "2026-09-07", startAt: "2026-09-06T23:00:00.000Z", endAt: "2026-09-07T01:00:00.000Z",
      version: 1, targetStartDate: "2026-09-07", targetEndDate: "2026-09-13",
    }, "admin", ["employee-1"], undefined, { "role-1": "Cashier" }, { "role-1": [] }))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: "employee-1" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
  });

  it("blocks Copy Week preview and commit when a source assignee lost the formal grant", async () => {
    const source = { ...period, shifts: [{ ...db.shiftRow, assignments: [currentAssignment("QA Employee")] }] };
    db.rosterPeriod.findFirst.mockResolvedValueOnce(source as never).mockResolvedValueOnce(null as never);
    const input = { storeId: "store-1", sourcePeriodId: "period-1", targetStartDate: "2026-09-14",
      activeEmployeeIds: ["employee-1"], formalRoleIds: ["role-1"], qualified: { "role-1": [] } };
    const preview = await service.previewCopyPeriod(input);
    expect(preview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: "employee-1" })]));
    expect(preview.canCopy).toBe(false);
    db.rosterPeriod.findFirst.mockResolvedValueOnce(source as never);
    await expect(service.copyPeriod({ ...input, expectedSourcePeriodVersion: 1 }, "admin"))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNQUALIFIED_EMPLOYEE_ROLE", employeeId: "employee-1" } });
    expect(db.shift.create).not.toHaveBeenCalled();
  });

  it("rejects a note-only batch change for a legacy role before writing", async () => {
    db.shift.findMany.mockResolvedValueOnce([{ ...db.shiftRow, rosterPeriod: period, assignments: [] }] as never);
    await expect(service.batchUpdate("store-1", [{ id: "shift-1", version: 1 }], { publicNote: "test" }, "admin", ["employee-1"], []))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE", shiftId: "shift-1" } });
    expect(db.shift.updateMany).not.toHaveBeenCalled();
    expect(db.rosterPeriod.updateMany).not.toHaveBeenCalled();
  });
});

function availableWindow() {
  return { employeeId: "employee-1", status: "AVAILABLE", startAt: new Date("2026-09-06T22:00:00.000Z"), endAt: new Date("2026-09-07T02:00:00.000Z") };
}

function currentAssignment(name: string, score: number | null = null) {
  return { employeeId: "employee-1", employeeNameSnapshot: name, employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: score == null ? null : "PartTime", officialScoreSnapshot: score, tierSnapshot: score == null ? null : "T2", officialScoreRoundId: score == null ? null : "closed-round", officialScoreClosedAt: score == null ? null : "2026-09-01T00:00:00.000Z" };
}

function createDb() {
  const role = { id: "role-1", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 1, version: 1, createdAt: new Date(), updatedAt: new Date() };
  const shift = { id: "shift-1", rosterPeriodId: period.id, storeId: period.storeId, date: period.startDate, startAt: new Date("2026-09-06T23:00:00.000Z"), endAt: new Date("2026-09-07T01:00:00.000Z"), breakMinutes: 30, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, publicNote: null, internalNote: null, version: 1, createdByAccountId: "admin", updatedByAccountId: "admin", createdAt: new Date(), updatedAt: new Date(), shiftRole: role, assignments: [] };
  const database = {
    rosterPeriod: { findMany: vi.fn(async () => [period]), findFirst: vi.fn(async () => period), findUniqueOrThrow: vi.fn(async () => period), create: vi.fn(async () => period), update: vi.fn(async () => ({ ...period, version: 2 })), updateMany: vi.fn(async () => ({ count: 1 })) },
    rosterPublication: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(async () => []), count: vi.fn(async () => 1) },
    shiftRole: { findFirst: vi.fn(async () => role), findMany: vi.fn(async () => [role]) },
    shiftAssignment: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 1 })) },
    shift: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => shift), count: vi.fn(async () => 0), create: vi.fn(async () => shift), update: vi.fn(async () => ({ ...shift, version: 2 })), updateMany: vi.fn(async () => ({ count: 1 })), deleteMany: vi.fn(async () => ({ count: 1 })) },
    shiftTemplate: { findMany: vi.fn(async () => []), findFirst: vi.fn(), create: vi.fn(async (input) => ({ id: "template-new", ...input.data })), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    availabilityTemplate: { update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    employeeAvailability: { count: vi.fn(async () => 0), deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 0 })), findMany: vi.fn(async () => []) },
    rosterStoreSettings: { findUnique: vi.fn(async () => ({ storeId: "store-1", timezone: "Australia/Sydney", openingTime: "00:00", closingTime: "23:59", minimumShiftMinutes: 1, version: 1 })), findUniqueOrThrow: vi.fn(async () => ({ storeId: "store-1", version: 2 })), create: vi.fn(async (input) => input.data), update: vi.fn(async (input) => input.data), updateMany: vi.fn(async () => ({ count: 1 })) },
    $executeRaw: vi.fn(async () => 1),
  };
  return { ...database, shiftRow: shift, $transaction: vi.fn(async (callback: (transaction: typeof database) => unknown) => callback(database)) };
}
