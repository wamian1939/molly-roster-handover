import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("immutable publication history on PostgreSQL", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `publication-test-${suffix}`;
  let roleId = "";

  afterAll(async () => {
    await prisma.rosterPublication.deleteMany({ where: { rosterPeriod: { storeId } } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    if (roleId) await prisma.shiftRole.deleteMany({ where: { id: roleId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("keeps publication #1 invariant after live names, role, shift, and publication #2 change", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `front-${suffix}`, nameZh: "Original Role", colorToken: "#2563eb" } }); roleId = role.id;
    await prisma.rosterStoreSettings.create({ data: { storeId, timezone: "Australia/Adelaide", openingTime: "08:00" } });
    const period = await prisma.rosterPeriod.create({ data: { storeId, startDate: new Date("2038-09-06T00:00:00.000Z"), endDate: new Date("2038-09-12T00:00:00.000Z"), cycleType: "WEEK", createdByAccountId: "integration-admin" } });
    await prisma.employeeAvailability.create({ data: { storeId, employeeId: "archived-later", date: new Date("2038-09-07T00:00:00.000Z"), status: "AVAILABLE", startAt: new Date("2038-09-06T23:00:00.000Z"), endAt: new Date("2038-09-07T09:00:00.000Z") } });
    await prisma.shift.create({ data: { rosterPeriodId: period.id, storeId, date: new Date("2038-09-07T00:00:00.000Z"), startAt: new Date("2038-09-06T23:00:00.000Z"), endAt: new Date("2038-09-07T07:00:00.000Z"), breakMinutes: 30, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, publicNote: "Version one", internalNote: "Manager one", createdByAccountId: "integration-admin", updatedByAccountId: "integration-admin", assignments: { create: { employeeId: "archived-later", employeeNameSnapshot: "Original Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 88, tierSnapshot: "T2", officialScoreRoundId: "closed-round", officialScoreClosedAt: new Date("2038-09-01T00:00:00.000Z") } } } });

    const initialEmployee = { employeeId: "archived-later", employeeNameSnapshot: "Original Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: 88, tierSnapshot: "T2", officialScoreRoundId: "closed-round", officialScoreClosedAt: "2038-09-01T00:00:00.000Z" };
    const firstPublish = await service.publishPeriod(storeId, period.id, 1, { accountId: "integration-admin", displayName: "Integration Admin" }, { id: storeId, name: "Original Store" }, [initialEmployee], [role.id], { [role.id]: "Official Role v1" }, undefined, { [role.id]: "#9f1239" });
    const firstId = firstPublish.publication.id;
    // Simulate a legacy/direct settings change between revisions to prove the first export stays frozen.
    await prisma.rosterStoreSettings.update({ where: { storeId }, data: { timezone: "Australia/Sydney" } });
    await service.reopenPeriod(storeId, period.id, 2);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { nameZh: "Changed Role", colorToken: "#dc2626" } });
    const liveShift = await prisma.shift.findFirstOrThrow({ where: { rosterPeriodId: period.id } });
    await prisma.shift.update({ where: { id: liveShift.id }, data: { startAt: new Date("2038-09-07T01:00:00.000Z"), endAt: new Date("2038-09-07T09:00:00.000Z"), publicNote: "Version two", roleNameSnapshot: "Changed Role", roleColorSnapshot: "#dc2626" } });
    const currentPeriod = await prisma.rosterPeriod.update({ where: { id: period.id }, data: { version: { increment: 1 } } });
    const secondPublish = await service.publishPeriod(storeId, period.id, currentPeriod.version, { accountId: "integration-admin", displayName: "Integration Admin" }, { id: storeId, name: "Renamed Store" }, [{ ...initialEmployee, employeeNameSnapshot: "Renamed Employee", employeeTypeSnapshot: "TRAINING", officialScoreSnapshot: 91, tierSnapshot: "T1", officialScoreRoundId: "new-closed-round", officialScoreClosedAt: "2038-09-05T00:00:00.000Z" }], [role.id], { [role.id]: "Official Role v2" }, undefined, { [role.id]: "#115e59" });

    const first = await service.getPublication(storeId, firstId, "manager");
    const second = await service.getPublication(storeId, secondPublish.publication.id, "manager");
    expect(first.revisionNumber).toBe(1);
    expect(second.revisionNumber).toBe(2);
    const firstRow = await prisma.rosterPublication.findUniqueOrThrow({ where: { id: firstId } });
    await prisma.rosterPublication.update({ where: { id: secondPublish.publication.id }, data: { publishedAt: firstRow.publishedAt } });
    const listedRevisions = await service.listPublications(storeId, period.id);
    for (const listed of listedRevisions) {
      const detail = await service.getPublication(storeId, listed.id, "manager");
      expect(detail.revisionNumber).toBe(listed.revisionNumber);
    }
    expect(first.snapshot.store.name).toBe("Original Store");
    expect(first.snapshot.timezone).toBe("Australia/Adelaide");
    expect(second.snapshot.timezone).toBe("Australia/Sydney");
    expect(first.snapshot.shifts[0]).toMatchObject({ roleNameSnapshot: "Official Role v1", roleColorSnapshot: "#9f1239", publicNote: "Version one" });
    expect(first.snapshot.shifts[0]?.assignments[0]).toMatchObject({ employeeNameSnapshot: "Original Employee", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: 88, tierSnapshot: "T2" });
    expect(second.snapshot.shifts[0]).toMatchObject({ roleNameSnapshot: "Official Role v2", roleColorSnapshot: "#115e59", publicNote: "Version two" });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: liveShift.id } })).roleNameSnapshot).toBe("Changed Role");
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: liveShift.id } })).roleColorSnapshot).toBe("#115e59");
    expect(second.snapshot.shifts[0]?.assignments[0]).toMatchObject({ employeeNameSnapshot: "Renamed Employee", employeeTypeSnapshot: "TRAINING", officialScoreSnapshot: 91, tierSnapshot: "T1", officialScoreRoundId: "new-closed-round" });
    const employeeSafe = await service.getPublication(storeId, firstId, "employee");
    expect(employeeSafe.snapshot.shifts[0]).not.toHaveProperty("internalNote");
    expect(employeeSafe.snapshot.shifts[0]?.assignments[0]).not.toHaveProperty("officialScoreSnapshot");
    await expect(service.getPublication("other-store", firstId, "employee")).rejects.toMatchObject({ status: 404 });
    const exportedFirst = await service.exportPublication(storeId, firstId);
    const exportedSecond = await service.exportPublication(storeId, secondPublish.publication.id);
    expect(exportedFirst.timezone).toBe("Australia/Adelaide");
    expect(exportedSecond.timezone).toBe("Australia/Sydney");
    expect(exportedFirst.shifts[0]?.publicNote).toBe("Version one");
    expect(exportedSecond.shifts[0]?.publicNote).toBe("Version two");
    const latest = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const reopened = await service.reopenPeriod(storeId, period.id, latest.version);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    await expect(service.publishPeriod(storeId, period.id, reopened.version, { accountId: "integration-admin", displayName: "Integration Admin" }, { id: storeId, name: "Renamed Store" }, [initialEmployee]))
      .rejects.toMatchObject({ status: 422, validation: { code: "INACTIVE_SHIFT_ROLE" } });
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true } });
    await expect(service.publishPeriod(storeId, period.id, reopened.version, { accountId: "integration-admin", displayName: "Integration Admin" }, { id: storeId, name: "Renamed Store" }, [])).rejects.toMatchObject({ status: 422, validation: { code: "ARCHIVED_EMPLOYEE" } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(2);
    expect((await service.getPublication(storeId, firstId, "manager")).snapshot).toEqual(first.snapshot);
  });
});
