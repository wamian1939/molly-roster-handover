import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("Shift Role write synchronization", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `role-race-${suffix}`;
  const employeeId = `role-race-employee-${suffix}`;

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  async function waitForAdvisoryWaiter(minimum = 1) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const rows = await prisma.$queryRaw<Array<{ waiting: number }>>`SELECT count(*)::int AS waiting FROM pg_locks
        WHERE locktype = 'advisory' AND NOT granted
          AND classid = hashtext(${storeId})::oid AND objid = hashtext('roster-period')::oid`;
      if ((rows[0]?.waiting ?? 0) >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Expected a write waiting on the store advisory lock");
  }

  function holdStoreLock() {
    let release!: () => void;
    let ready!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const transaction = prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${storeId}), hashtext('roster-period'))`);
      ready();
      await released;
    }, { timeout: 12_000 });
    return { locked, release, transaction };
  }

  it("rechecks a role after waiting for the store lock and serializes role deactivation", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `race-${suffix}`, nameZh: "Race QA", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-07"], entries: [{ date: "2037-10-07", status: "AVAILABLE", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T13:00:00.000Z" }] });
    const mutation = { storeId, rosterPeriodId: period.id, date: "2037-10-07", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T13:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
      assignments: [{ employeeId, employeeNameSnapshot: "Race QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] };

    const first = holdStoreLock();
    await first.locked;
    const create = service.createShift(mutation, "qa-account").then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForAdvisoryWaiter();
      await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    } finally {
      first.release();
      await first.transaction;
    }
    const result = await create;
    expect(result).toMatchObject({ error: { status: 422, validation: { code: "INACTIVE_SHIFT_ROLE" } } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(0);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(period.version);

    const reactivated = await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true } });
    const second = holdStoreLock();
    await second.locked;
    const deactivate = service.updateRole(role.id, { storeId, nameZh: reactivated.nameZh, colorToken: reactivated.colorToken,
      requiredSkillCodes: reactivated.requiredSkillCodes, isActive: false, displayOrder: reactivated.displayOrder, version: reactivated.version });
    try {
      await waitForAdvisoryWaiter();
      expect((await prisma.shiftRole.findUniqueOrThrow({ where: { id: role.id } })).isActive).toBe(true);
    } finally {
      second.release();
      await second.transaction;
    }
    expect((await deactivate).isActive).toBe(false);
  });

  it("rechecks store hours after a concurrent settings change", async () => {
    const role = await prisma.shiftRole.findFirstOrThrow({ where: { storeId } });
    const period = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId } });
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true } });
    const mutation = { storeId, rosterPeriodId: period.id, date: "2037-10-07", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T13:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
      assignments: [{ employeeId, employeeNameSnapshot: "Race QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] };
    const holder = holdStoreLock();
    await holder.locked;
    const create = service.createShift(mutation, "qa-account").then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForAdvisoryWaiter();
      await prisma.rosterStoreSettings.update({ where: { storeId }, data: { openingTime: "10:00" } });
    } finally {
      holder.release();
      await holder.transaction;
    }
    expect(await create).toMatchObject({ error: { status: 400, validation: { code: "OUTSIDE_OPERATING_HOURS" } } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(0);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(period.version);
  });

  it("rejects concurrent name-only activations for a formal job without a code", async () => {
    const job = { id: `job-${suffix}`, code: null, name: "Shared Formal Job", isActive: true };
    const roles = await Promise.all(["a", "b"].map((letter) => prisma.shiftRole.create({ data: {
      storeId, code: `shared-${letter}-${suffix}`, nameZh: job.name, colorToken: "#334155", isActive: false,
    } })));
    const results = await Promise.all(roles.map((role) => service.updateRole(role.id, {
      storeId, nameZh: role.nameZh, colorToken: role.colorToken, requiredSkillCodes: [], isActive: true,
      displayOrder: role.displayOrder, version: role.version,
    }, [job]).then((value) => ({ value }), (error: unknown) => ({ error }))));
    expect(results.filter((item) => "value" in item)).toHaveLength(0);
    expect(results.filter((item) => "error" in item)).toMatchObject([{ error: { status: 422 } }, { error: { status: 422 } }]);
    const stored = await prisma.shiftRole.findMany({ where: { id: { in: roles.map((role) => role.id) } } });
    expect(stored.every((role) => !role.isActive && role.version === 1)).toBe(true);
  });

  it("creates a code-matched role when a same-name legacy role cannot acquire the formal job", async () => {
    const job = { id: `create-job-${suffix}`, code: `official-create-${suffix}`, name: "Shared Formal Job Create", isActive: true };
    const previous = await prisma.shiftRole.create({ data: { storeId, code: `legacy-create-${suffix}`,
      nameZh: job.name, colorToken: "#334155", isActive: false } });
    await expect(service.updateRole(previous.id, { storeId, nameZh: previous.nameZh, colorToken: previous.colorToken,
      requiredSkillCodes: [], isActive: true, displayOrder: previous.displayOrder, version: previous.version }, [job]))
      .rejects.toMatchObject({ status: 422 });
    const official = await service.createRole({ storeId, code: job.code, nameZh: job.name, colorToken: "#2563eb",
      requiredSkillCodes: [] }, [job]);
    expect(official).toMatchObject({ code: job.code, isActive: true });
    expect(await prisma.shiftRole.count({ where: { storeId, code: job.code } })).toBe(1);
    expect(await prisma.shiftRole.findUniqueOrThrow({ where: { id: previous.id } })).toMatchObject({ isActive: false, version: 1 });
  });

  it("keeps a role active while a draft Shift still depends on it", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `draft-role-${suffix}`, nameZh: "Draft Role", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-12", endDate: "2037-10-18", cycleType: "WEEK" }, "qa-account");
    await prisma.shift.create({ data: { storeId, rosterPeriodId: period.id, date: new Date("2037-10-14T00:00:00.000Z"),
      startAt: new Date("2037-10-14T09:00:00.000Z"), endAt: new Date("2037-10-14T10:00:00.000Z"),
      shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account" } });

    await expect(service.updateRole(role.id, { storeId, nameZh: role.nameZh, colorToken: role.colorToken,
      requiredSkillCodes: [], isActive: false, displayOrder: role.displayOrder, version: role.version }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.shiftRole.findUniqueOrThrow({ where: { id: role.id } })).toMatchObject({ isActive: true, version: role.version });
    expect(await prisma.shift.count({ where: { rosterPeriodId: period.id } })).toBe(1);
  });

  it("does not deactivate a role after a concurrent Shift creation acquires the store lock first", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `concurrent-draft-${suffix}`, nameZh: "Concurrent Draft", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-19", endDate: "2037-10-25", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-21"], entries: [{ date: "2037-10-21", status: "AVAILABLE",
      startAt: "2037-10-21T10:00:00.000Z", endAt: "2037-10-21T13:00:00.000Z" }] });
    const holder = holdStoreLock();
    await holder.locked;
    const create = service.createShift({ storeId, rosterPeriodId: period.id, date: "2037-10-21",
      startAt: "2037-10-21T10:00:00.000Z", endAt: "2037-10-21T13:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
      assignments: [{ employeeId, employeeNameSnapshot: "Race QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null,
        officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "qa-account")
      .then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForAdvisoryWaiter();
      const deactivate = service.updateRole(role.id, { storeId, nameZh: role.nameZh, colorToken: role.colorToken,
        requiredSkillCodes: role.requiredSkillCodes, isActive: false, displayOrder: role.displayOrder, version: role.version })
        .then((value) => ({ value }), (error: unknown) => ({ error }));
      await waitForAdvisoryWaiter(2);
      holder.release();
      await holder.transaction;
      expect(await create).toMatchObject({ value: { shiftRoleId: role.id } });
      expect(await deactivate).toMatchObject({ error: { status: 409 } });
    } finally {
      holder.release();
      await holder.transaction;
    }
    expect(await prisma.shift.count({ where: { rosterPeriodId: period.id, shiftRoleId: role.id } })).toBe(1);
    expect(await prisma.shiftRole.findUniqueOrThrow({ where: { id: role.id } })).toMatchObject({ isActive: true, version: role.version });
  });

  it("does not create a Shift after role deactivation acquires the store lock first", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `deactivate-first-${suffix}`, nameZh: "Deactivate First", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-26", endDate: "2037-11-01", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-28"], entries: [{ date: "2037-10-28", status: "AVAILABLE",
      startAt: "2037-10-28T10:00:00.000Z", endAt: "2037-10-28T13:00:00.000Z" }] });
    const holder = holdStoreLock();
    await holder.locked;
    const deactivate = service.updateRole(role.id, { storeId, nameZh: role.nameZh, colorToken: role.colorToken,
      requiredSkillCodes: role.requiredSkillCodes, isActive: false, displayOrder: role.displayOrder, version: role.version })
      .then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await waitForAdvisoryWaiter();
      const create = service.createShift({ storeId, rosterPeriodId: period.id, date: "2037-10-28",
        startAt: "2037-10-28T10:00:00.000Z", endAt: "2037-10-28T13:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
        assignments: [{ employeeId, employeeNameSnapshot: "Race QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null,
          officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "qa-account")
        .then((value) => ({ value }), (error: unknown) => ({ error }));
      await waitForAdvisoryWaiter(2);
      holder.release();
      await holder.transaction;
      expect(await deactivate).toMatchObject({ value: { isActive: false, version: role.version + 1 } });
      expect(await create).toMatchObject({ error: { status: 422, validation: { code: "INACTIVE_SHIFT_ROLE" } } });
    } finally {
      holder.release();
      await holder.transaction;
    }
    expect(await prisma.shift.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.shiftRole.findUniqueOrThrow({ where: { id: role.id } })).toMatchObject({ isActive: false, version: role.version + 1 });
  });
});
