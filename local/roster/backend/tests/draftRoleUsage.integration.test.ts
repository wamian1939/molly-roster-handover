import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("draft role inventory", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `role-inventory-${suffix}`;
  const otherStoreId = `other-role-inventory-${suffix}`;

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.shiftRole.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it("counts only this store's draft shifts, including inactive legacy roles, without changing published history", async () => {
    const [legacy, official, other] = await Promise.all([
      prisma.shiftRole.create({ data: { storeId, code: "legacy", nameZh: "验收岗", colorToken: "#334155", isActive: false } }),
      prisma.shiftRole.create({ data: { storeId, code: "formal", nameZh: "正式岗", colorToken: "#2563EB" } }),
      prisma.shiftRole.create({ data: { storeId: otherStoreId, code: "legacy", nameZh: "其他门店旧岗", colorToken: "#334155" } }),
    ]);
    const [draft, published, otherDraft] = await Promise.all([
      prisma.rosterPeriod.create({ data: { storeId, startDate: new Date("2026-09-07T00:00:00Z"), endDate: new Date("2026-09-13T00:00:00Z"), cycleType: "WEEK", createdByAccountId: "qa" } }),
      prisma.rosterPeriod.create({ data: { storeId, startDate: new Date("2026-09-14T00:00:00Z"), endDate: new Date("2026-09-20T00:00:00Z"), cycleType: "WEEK", status: "PUBLISHED", createdByAccountId: "qa" } }),
      prisma.rosterPeriod.create({ data: { storeId: otherStoreId, startDate: new Date("2026-09-07T00:00:00Z"), endDate: new Date("2026-09-13T00:00:00Z"), cycleType: "WEEK", createdByAccountId: "qa" } }),
    ]);
    const addShift = (id: string, periodId: string, owner: string, date: string, roleId: string, roleName: string) => prisma.shift.create({ data: {
      id, rosterPeriodId: periodId, storeId: owner, date: new Date(`${date}T00:00:00Z`),
      startAt: new Date(`${date}T09:00:00Z`), endAt: new Date(`${date}T13:00:00Z`),
      shiftRoleId: roleId, roleNameSnapshot: roleName, roleColorSnapshot: "#334155",
      createdByAccountId: "qa", updatedByAccountId: "qa",
    } });
    await Promise.all([
      addShift(`legacy-a-${suffix}`, draft.id, storeId, "2026-09-08", legacy.id, legacy.nameZh),
      addShift(`legacy-b-${suffix}`, draft.id, storeId, "2026-09-09", legacy.id, legacy.nameZh),
      addShift(`formal-${suffix}`, draft.id, storeId, "2026-09-10", official.id, official.nameZh),
      addShift(`published-${suffix}`, published.id, storeId, "2026-09-15", legacy.id, legacy.nameZh),
      addShift(`other-${suffix}`, otherDraft.id, otherStoreId, "2026-09-08", other.id, other.nameZh),
    ]);

    expect(await service.listDraftRoleUsage(storeId)).toEqual([
      { id: legacy.id, code: "legacy", nameZh: "验收岗", isActive: false, shiftCount: 2, firstDate: "2026-09-08" },
      { id: official.id, code: "formal", nameZh: "正式岗", isActive: true, shiftCount: 1, firstDate: "2026-09-10" },
    ]);
    expect(await prisma.shift.count({ where: { rosterPeriodId: published.id } })).toBe(1);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: published.id } })).status).toBe("PUBLISHED");
  });
});
