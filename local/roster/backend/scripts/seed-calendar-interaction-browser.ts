import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
const command = process.argv[2];
if (!["seed", "extend-week", "verify", "verify-history", "verify-drag-create", "verify-upward-drag", "verify-stale-resize", "verify-two-evaluator-resize", "verify-minimum-click", "seed-empty-week", "verify-empty-week", "verify-gesture-cancel", "seed-minimum-store", "seed-overnight-store", "seed-odd-minimum-store", "verify-odd-minimum", "set-unfit-minimum-store", "restore-odd-minimum-store", "verify-rejected-unfit-minimum", "seed-fallback-day", "verify-fallback-day", "seed-fallback-copy", "verify-fallback-copy", "verify-fallback-shift-copy", "verify-invalid-calendar-date", "seed-malformed-period", "verify-malformed-period"].includes(command)) {
  throw new Error("Expected seed, extend-week, verify, verify-history, verify-drag-create, verify-upward-drag, verify-stale-resize, verify-two-evaluator-resize, verify-minimum-click, seed-empty-week, verify-empty-week, verify-gesture-cancel, seed-minimum-store, seed-overnight-store, seed-odd-minimum-store, verify-odd-minimum, set-unfit-minimum-store, restore-odd-minimum-store, verify-rejected-unfit-minimum, seed-fallback-day, verify-fallback-day, seed-fallback-copy, or verify-fallback-copy");
}
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe fixture schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("The fixture must use its isolated local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (command === "seed-malformed-period") {
    if (await db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-11-02") } })) {
      throw new Error("Malformed source fixture already exists");
    }
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
    await db.rosterPeriod.create({ data: { id: "qa-malformed-period", storeId: "browser-store",
      startDate: new Date("2026-11-02"), endDate: new Date("2026-11-02"), cycleType: "WEEK",
      createdByAccountId: "qa-admin" } });
    await db.shift.create({ data: { id: "qa-malformed-shift", rosterPeriodId: "qa-malformed-period", storeId: "browser-store",
        date: new Date("2026-11-02"), startAt: new Date("2026-11-01T22:00:00.000Z"),
        endAt: new Date("2026-11-01T23:00:00.000Z"), breakMinutes: 0, shiftRoleId: role.id,
        roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
        createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
          employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR" } } } });
    console.log(JSON.stringify({ seeded: true, sourcePeriodId: "qa-malformed-period" }));
  } else if (command === "verify-malformed-period") {
    const [source, targetPeriods, published] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-malformed-period" }, include: { shifts: { include: { assignments: true } }, publications: true } }),
      db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-11-09") } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    if (source.status !== "DRAFT" || source.version !== 1 || source.shifts.length !== 1 || source.shifts[0]?.id !== "qa-malformed-shift"
      || source.shifts[0]?.assignments[0]?.employeeId !== "browser-HandoverEmployee006" || source.publications.length !== 0
      || targetPeriods !== 0 || published.version !== 1 || published.publications.length !== 1) {
      throw new Error("Malformed period preview, copy, or publish changed disposable roster state");
    }
    console.log(JSON.stringify({ verified: true, sourceVersion: source.version, sourceShifts: source.shifts.length,
      targetPeriods, sourcePublications: source.publications.length, publishedVersion: published.version }));
  } else if (command === "verify-invalid-calendar-date") {
    const [periods, shifts, assignments, publications] = await Promise.all([
      db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true, status: true } }),
      db.shift.count({ where: { storeId: "browser-store" } }),
      db.shiftAssignment.count({ where: { shift: { storeId: "browser-store" } } }),
      db.rosterPublication.count({ where: { rosterPeriod: { storeId: "browser-store" } } }),
    ]);
    if (periods.length !== 2 || periods.some((period) => period.version !== 1)
      || periods.filter((period) => period.status === "PUBLISHED").length !== 1
      || shifts !== 3 || assignments !== 3 || publications !== 1) {
      throw new Error("Invalid calendar dates changed disposable roster records");
    }
    console.log(JSON.stringify({ verified: true, periods: periods.length, shifts, assignments, publications }));
  } else if (command === "seed-fallback-copy") {
    const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } });
    const settings = await db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } });
    if (period.status !== "DRAFT" || period.version !== 1 || settings.openingTime !== "00:00" || settings.closingTime !== "23:59"
      || await db.shift.count({ where: { rosterPeriodId: period.id } })
      || await db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2027-04-04") } })) {
      throw new Error("Fallback copy source fixture is not pristine");
    }
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
    await db.shift.create({ data: { id: "qa-fallback-copy-source", rosterPeriodId: period.id, storeId: "browser-store",
      date: new Date("2026-04-05"), startAt: new Date("2026-04-04T15:30:00.000Z"), endAt: new Date("2026-04-04T16:30:00.000Z"),
      breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
        employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime",
      } } } });
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: new Date("2027-04-04"), status: "AVAILABLE", startAt: new Date("2027-04-03T14:00:00.000Z"),
      endAt: new Date("2027-04-03T18:00:00.000Z") } });
    console.log(JSON.stringify({ seeded: true, sourceDate: "2026-04-05", targetDate: "2027-04-04" }));
  } else if (command === "verify-fallback-shift-copy") {
    const [source, copied, invalidTarget, published] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-fallback-copy-source" }, include: { assignments: true } }),
      db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2027-04-04") }, include: { assignments: true, rosterPeriod: true } }),
      db.shift.count({ where: { storeId: "browser-store", date: new Date("2026-04-12") } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    if (source.version !== 1 || copied.length !== 1 || copied[0]?.id === source.id || copied[0]?.rosterPeriod.status !== "DRAFT"
      || copied[0]?.startAt.toISOString() !== "2027-04-03T15:30:00.000Z" || copied[0]?.endAt.toISOString() !== "2027-04-03T16:30:00.000Z"
      || copied[0]?.assignments.length !== 1 || copied[0]?.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
      || invalidTarget !== 0 || published.version !== 1 || published.publications.length !== 1) {
      throw new Error("Fallback Copy Shift changed source, target, or publication unexpectedly");
    }
    console.log(JSON.stringify({ verified: true, copiedShiftId: copied[0]?.id, startAt: copied[0]?.startAt.toISOString(),
      endAt: copied[0]?.endAt.toISOString(), employeeId: copied[0]?.assignments[0]?.employeeId, invalidTarget, publishedVersion: published.version }));
  } else if (command === "verify-fallback-copy") {
    const [source, target, copied, normalTarget, published] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-fallback-copy-source" }, include: { assignments: true } }),
      db.rosterPeriod.findFirstOrThrow({ where: { storeId: "browser-store", startDate: new Date("2027-03-29") } }),
      db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2027-04-04") }, include: { assignments: true } }),
      db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-04-06") } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    if (source.version !== 1 || source.startAt.toISOString() !== "2026-04-04T15:30:00.000Z"
      || source.endAt.toISOString() !== "2026-04-04T16:30:00.000Z" || copied.length !== 1 || target.status !== "DRAFT"
      || copied[0]?.startAt.toISOString() !== "2027-04-03T15:30:00.000Z" || copied[0]?.endAt.toISOString() !== "2027-04-03T16:30:00.000Z"
      || copied[0]?.assignments.length !== 1 || copied[0]?.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
      || normalTarget !== 0 || published.version !== 1 || published.publications.length !== 1) {
      throw new Error("Fallback Copy Day changed source, target, or published history unexpectedly");
    }
    console.log(JSON.stringify({ verified: true, targetShiftCount: copied.length, targetStartAt: copied[0]?.startAt.toISOString(),
      targetEndAt: copied[0]?.endAt.toISOString(), normalDayTargetPeriods: normalTarget, publishedVersion: published.version }));
  } else if (command === "seed-fallback-day") {
    if (await db.rosterStoreSettings.count({ where: { storeId: "browser-store" } })
      || await db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-03-30") } })) {
      throw new Error("Fallback QA fixture is already seeded");
    }
    await db.rosterStoreSettings.create({ data: { storeId: "browser-store", openingTime: "00:00", closingTime: "23:59" } });
    await db.rosterPeriod.create({ data: { id: "qa-fallback-period", storeId: "browser-store", startDate: new Date("2026-03-30"),
      endDate: new Date("2026-04-05"), cycleType: "WEEK", createdByAccountId: "qa-admin" } });
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: new Date("2026-04-05"), status: "AVAILABLE", startAt: new Date("2026-04-04T14:00:00.000Z"),
      endAt: new Date("2026-04-04T18:00:00.000Z") } });
    console.log(JSON.stringify({ seeded: true, date: "2026-04-05", openingTime: "00:00", closingTime: "23:59" }));
  } else if (command === "verify-fallback-day") {
    const [period, shifts, published] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } }),
      db.shift.findMany({ where: { rosterPeriodId: "qa-fallback-period" }, include: { assignments: true } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    const shift = shifts[0];
    if (period.version !== 3 || shifts.length !== 1 || shift.version !== 2 || shift.publicNote !== "Fallback edit QA"
      || shift.startAt.toISOString() !== "2026-04-04T15:30:00.000Z" || shift.endAt.toISOString() !== "2026-04-04T16:30:00.000Z"
      || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
      || published.version !== 1 || published.publications.length !== 1) {
      throw new Error("Fallback Shift or immutable publication changed unexpectedly");
    }
    console.log(JSON.stringify({ verified: true, startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(),
      shiftVersion: shift.version, periodVersion: period.version, publishedVersion: published.version, publications: published.publications.length }));
  } else if (command === "seed-minimum-store" || command === "seed-overnight-store" || command === "seed-odd-minimum-store") {
    if (await db.rosterStoreSettings.count({ where: { storeId: "browser-store" } })) throw new Error("Fixture store settings already exist");
    const settings = await db.rosterStoreSettings.create({ data: { storeId: "browser-store",
      ...(command === "seed-overnight-store" ? { openingTime: "18:00", closingTime: "02:00" } : {}),
      ...(command === "seed-odd-minimum-store" ? { minimumShiftMinutes: 65 } : {}) } });
    console.log(JSON.stringify({ seeded: true, minimumShiftMinutes: settings.minimumShiftMinutes,
      slotIntervalMinutes: settings.slotIntervalMinutes, openingTime: settings.openingTime, closingTime: settings.closingTime }));
  } else if (command === "verify-rejected-unfit-minimum") {
    const [settings, draft, published, shiftCount] = await Promise.all([
      db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
      db.shift.count({ where: { storeId: "browser-store" } }),
    ]);
    if (settings.minimumShiftMinutes !== 65 || settings.version !== 3 || draft.version !== 2
      || published.version !== 1 || published.publications.length !== 1 || shiftCount !== 4) {
      throw new Error("Rejected store rule changed settings, Shift, draft, or publication");
    }
    console.log(JSON.stringify({ verified: true, minimumShiftMinutes: settings.minimumShiftMinutes, settingsVersion: settings.version,
      draftVersion: draft.version, publishedVersion: published.version, publications: published.publications.length, shiftCount }));
  } else if (command === "restore-odd-minimum-store") {
    const settings = await db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } });
    if (settings.openingTime !== "09:00" || settings.closingTime !== "22:00" || settings.minimumShiftMinutes !== 900) {
      throw new Error("Unexpected disposable store settings before odd-minimum restore");
    }
    await db.rosterStoreSettings.update({ where: { storeId: "browser-store" }, data: { minimumShiftMinutes: 65, version: { increment: 1 } } });
    console.log(JSON.stringify({ restored: true, minimumShiftMinutes: 65 }));
  } else if (command === "set-unfit-minimum-store") {
    const settings = await db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } });
    if (settings.openingTime !== "09:00" || settings.closingTime !== "22:00" || settings.minimumShiftMinutes !== 65) {
      throw new Error("Unexpected disposable store settings before unfit-minimum QA");
    }
    await db.rosterStoreSettings.update({ where: { storeId: "browser-store" }, data: { minimumShiftMinutes: 900, version: { increment: 1 } } });
    console.log(JSON.stringify({ updated: true, minimumShiftMinutes: 900, openingTime: "09:00", closingTime: "22:00" }));
  } else if (command === "verify-odd-minimum") {
    const [draft, published, shifts] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
      db.shift.findMany({ where: { storeId: "browser-store", publicNote: "Odd minimum QA" }, include: { assignments: true } }),
    ]);
    const shift = shifts[0];
    if (draft.version !== 2 || published.version !== 1 || published.publications.length !== 1 || shifts.length !== 1
      || shift.rosterPeriodId !== draft.id || shift.date.toISOString().slice(0, 10) !== "2026-10-10"
      || shift.startAt.toISOString() !== "2026-10-09T22:00:00.000Z" || shift.endAt.toISOString() !== "2026-10-09T23:30:00.000Z"
      || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006") {
      throw new Error("Odd-minimum browser creation did not persist the aligned 90-minute shift and preserve publication");
    }
    console.log(JSON.stringify({ verified: true, date: "2026-10-10", durationMinutes: 90,
      draftVersion: draft.version, publishedVersion: published.version, publications: published.publications.length }));
  } else if (command === "verify-gesture-cancel") {
    const [draft, published, shiftCount] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" }, include: { shifts: true } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
      db.shift.count({ where: { storeId: "browser-store" } }),
    ]);
    if (draft.version !== 1 || draft.shifts.length !== 2 || published.version !== 1 || published.publications.length !== 1 || shiftCount !== 3) {
      throw new Error("Canceled Calendar gestures changed draft or published data");
    }
    console.log(JSON.stringify({ verified: true, draftVersion: draft.version, draftShifts: draft.shifts.length,
      publishedVersion: published.version, publications: published.publications.length, totalShifts: shiftCount }));
  } else if (command === "seed-empty-week") {
    if (await db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-10-19") } })) throw new Error("Empty source week already exists");
    const period = await db.rosterPeriod.create({ data: { id: "qa-empty-source-week", storeId: "browser-store",
      startDate: new Date("2026-10-19"), endDate: new Date("2026-10-25"), cycleType: "WEEK", createdByAccountId: "qa-admin" } });
    console.log(JSON.stringify({ seeded: true, periodId: period.id, version: period.version }));
  } else if (command === "verify-empty-week") {
    const source = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-empty-source-week" }, include: { shifts: true } });
    const targetCount = await db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: new Date("2026-10-26") } });
    const published = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } });
    if (source.status !== "DRAFT" || source.version !== 1 || source.shifts.length || targetCount || published.version !== 1 || published.publications.length !== 1) {
      throw new Error("Empty-week Copy preview or forced execution changed the source, target, or publication");
    }
    console.log(JSON.stringify({ verified: true, sourceVersion: source.version, sourceShifts: source.shifts.length,
      targetPeriods: targetCount, publishedVersion: published.version, publications: published.publications.length }));
  } else if (command === "verify-drag-create" || command === "verify-upward-drag" || command === "verify-stale-resize" || command === "verify-two-evaluator-resize" || command === "verify-minimum-click") {
    const staleResize = command === "verify-stale-resize" || command === "verify-two-evaluator-resize";
    const expectedNote = command === "verify-two-evaluator-resize" ? "Evaluator B concurrent note"
      : command === "verify-upward-drag" ? "Upward drag QA" : command === "verify-minimum-click" ? "Minimum click QA"
        : staleResize ? "Concurrent resize QA" : "Drag create QA";
    const expectedEnd = command === "verify-minimum-click" || command === "verify-upward-drag"
      ? "2026-10-10T00:00:00.000Z" : "2026-10-10T00:30:00.000Z";
    const shifts = await db.shift.findMany({
      where: { storeId: "browser-store", date: new Date("2026-10-10"), publicNote: expectedNote },
      include: { assignments: true },
    });
    if (shifts.length !== 1) throw new Error(`Expected exactly one dragged Shift; found ${shifts.length}`);
    const [shift] = shifts;
    const [draftPeriod, publishedPeriod] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    if (shift.rosterPeriodId !== "qa-draft-period" || shift.startAt.toISOString() !== "2026-10-09T23:00:00.000Z" ||
      shift.endAt.toISOString() !== expectedEnd ||
      shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-HandoverEmployee006" || shift.version !== (staleResize ? 2 : 1) ||
      draftPeriod.version !== (staleResize ? 3 : 2) || publishedPeriod.version !== 1 || publishedPeriod.publications.length !== 1) {
      throw new Error("Dragged Shift persistence differs from selected Sydney time, period, or employee");
    }
    console.log(JSON.stringify({ verified: true, id: shift.id, date: "2026-10-10", startAt: shift.startAt.toISOString(),
      endAt: shift.endAt.toISOString(), periodId: shift.rosterPeriodId, employeeId: shift.assignments[0].employeeId,
      shiftVersion: shift.version, draftVersion: draftPeriod.version, publishedVersion: publishedPeriod.version, count: shifts.length }));
  } else if (command === "verify-history") {
    const periods = await db.rosterPeriod.findMany({
      where: { storeId: "browser-store" },
      include: { publications: true },
      orderBy: { startDate: "asc" },
    });
    console.log(JSON.stringify(periods.map((period) => ({
      startDate: period.startDate.toISOString().slice(0, 10),
      status: period.status,
      version: period.version,
      publicationVersions: period.publications.map((row) => row.periodVersion),
      publicationDigests: period.publications.map((row) => createHash("sha256").update(JSON.stringify(row.snapshot)).digest("hex")),
    }))));
  } else if (command === "verify") {
    const shifts = await db.shift.findMany({
      where: { storeId: "browser-store", date: { gte: new Date("2026-10-06"), lte: new Date("2026-10-08") } },
      include: { assignments: true },
      orderBy: { startAt: "asc" },
    });
    console.log(JSON.stringify(shifts.map((shift) => ({
      id: shift.id,
      date: shift.date.toISOString().slice(0, 10),
      startAt: shift.startAt.toISOString(),
      endAt: shift.endAt.toISOString(),
      version: shift.version,
      employeeIds: shift.assignments.map((row) => row.employeeId),
    }))));
  } else {
    const extendWeek = command === "extend-week";
    const existingAvailability = await db.employeeAvailability.count();
    if (extendWeek ? existingAvailability !== 42 : existingAvailability !== 0) throw new Error("Unexpected fixture availability count");
    const rows = [];
    for (let day = extendWeek ? 19 : 5; day <= (extendWeek ? 25 : 18); day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const previous = `2026-10-${String(day - 1).padStart(2, "0")}`;
      for (const employeeId of ["browser-regular", "browser-training", "browser-HandoverEmployee006"]) {
        rows.push({
          storeId: "browser-store",
          employeeId,
          date: new Date(date),
          startAt: new Date(`${previous}T22:00:00.000Z`),
          endAt: new Date(`${date}T11:00:00.000Z`),
          status: "AVAILABLE" as const,
        });
      }
    }
    await db.employeeAvailability.createMany({ data: rows });
    console.log(JSON.stringify({ seeded: rows.length, isolatedSchema: state.schema }));
  }
} finally {
  await db.$disconnect();
}
