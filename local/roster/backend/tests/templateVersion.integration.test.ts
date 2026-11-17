import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("versioned template updates on PostgreSQL", () => {
  const service = new RosterService(prisma);
  const storeId = `template-version-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  afterAll(async () => {
    await prisma.shiftTemplate.deleteMany({ where: { storeId } });
    await prisma.availabilityTemplate.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("returns its own shift-template row and rejects the competing version", async () => {
    const created = await service.createShiftTemplate({ storeId, name: "早班", startTime: "10:00", endTime: "17:00", breakMinutes: 30 });
    const update = (name: string) => service.updateShiftTemplate(created.id, { storeId, name,
      startTime: "10:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: null,
      isActive: true, displayOrder: 0, version: created.version });
    const outcomes = await Promise.allSettled([update("早班 A"), update("早班 B")]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof update>>> => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ status: 409 });
    const saved = fulfilled[0]!.value;
    expect(saved).toMatchObject({ id: created.id, storeId, version: created.version + 1 });
    expect(await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: saved.name, version: saved.version });
  });

  it("persists overnight template times on create and update", async () => {
    const created = await service.createShiftTemplate({ storeId, name: "Overnight", startTime: "18:00", endTime: "02:00", breakMinutes: 30 });
    expect(await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: created.id } }))
      .toMatchObject({ startTime: "18:00", endTime: "02:00", breakMinutes: 30 });

    const updated = await service.updateShiftTemplate(created.id, { storeId, name: "Overnight",
      startTime: "20:00", endTime: "04:00", breakMinutes: 60, shiftRoleId: null,
      isActive: true, displayOrder: 0, version: created.version });
    expect(await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: created.id } }))
      .toMatchObject({ startTime: "20:00", endTime: "04:00", breakMinutes: 60, version: updated.version });

    await expect(service.createShiftTemplate({ storeId, name: "Zero length", startTime: "18:00",
      endTime: "18:00", breakMinutes: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(service.createShiftTemplate({ storeId, name: "Break too long", startTime: "23:00",
      endTime: "01:00", breakMinutes: 120 })).rejects.toMatchObject({ status: 400 });
  });

  it("retires a versioned template after its old role is deactivated", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: "retired-role", nameZh: "旧岗位", colorToken: "#64748b", requiredSkillCodes: [] } });
    const created = await service.createShiftTemplate({ storeId, name: "旧岗位班型", startTime: "10:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: role.id });
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    const input = { storeId, name: created.name, startTime: created.startTime, endTime: created.endTime,
      breakMinutes: created.breakMinutes, shiftRoleId: role.id, displayOrder: created.displayOrder, version: created.version };
    const retired = await service.updateShiftTemplate(created.id, { ...input, isActive: false });
    expect(retired).toMatchObject({ id: created.id, isActive: false, shiftRoleId: role.id, version: created.version + 1 });
    await expect(service.updateShiftTemplate(created.id, { ...input, isActive: true, version: retired.version }))
      .rejects.toMatchObject({ status: 400 });
    expect(await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ isActive: false, shiftRoleId: role.id, version: retired.version });
  });

  it("returns its own availability-template row and rejects the competing version", async () => {
    const slots = [{ dayOffset: 0, status: "AVAILABLE", startTime: "10:00", endTime: "17:00" }];
    const created = await service.createAvailabilityTemplate({ storeId, name: "全天", slots });
    const update = (name: string) => service.updateAvailabilityTemplate(created.id, { storeId, name,
      slots, isActive: true, displayOrder: 0, version: created.version });
    const outcomes = await Promise.allSettled([update("全天 A"), update("全天 B")]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof update>>> => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ status: 409 });
    const saved = fulfilled[0]!.value;
    expect(saved).toMatchObject({ id: created.id, storeId, version: created.version + 1 });
    expect(await prisma.availabilityTemplate.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: saved.name, version: saved.version });
  });
});
