import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2];
if (!["seed", "original", "moved"].includes(mode)) throw new Error("Expected seed, original or moved");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
  url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (mode === "seed") {
    const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } });
    const existing = await db.employeeAvailability.findMany({ where: {
      storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-04-05"),
    } });
    if (period.status !== "DRAFT" || period.version !== 1 || existing.length !== 1 ||
      await db.shift.count({ where: { rosterPeriodId: period.id } })) throw new Error("Unexpected fallback fixture baseline");
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
    await db.$transaction(async (tx) => {
      await tx.employeeAvailability.update({ where: { id: existing[0].id }, data: {
        startAt: new Date("2026-04-04T13:00:00.000Z"), endAt: new Date("2026-04-04T23:00:00.000Z"),
      } });
      await tx.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
        date: new Date("2026-04-04"), status: "AVAILABLE", startAt: new Date("2026-04-03T13:00:00.000Z"),
        endAt: new Date("2026-04-03T23:00:00.000Z") } });
      await tx.shift.create({ data: { id: "qa-dst-cross-day-move", rosterPeriodId: period.id, storeId: "browser-store",
        date: new Date("2026-04-04"), startAt: new Date("2026-04-03T13:30:00.000Z"),
        endAt: new Date("2026-04-03T21:30:00.000Z"), breakMinutes: 0, shiftRoleId: role.id,
        roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
        createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
          employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR",
          employmentTypeSnapshot: "FullTime",
        } } } });
    });
    console.log(JSON.stringify({ seeded: true, source: "2026-04-04 00:30-08:30", target: "2026-04-05 00:30-07:30" }));
  } else {
    const [shift, period, count, published] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-dst-cross-day-move" }, include: { assignments: true } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } }),
      db.shift.count({ where: { storeId: "browser-store" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
    ]);
    const moved = mode === "moved";
    if (shift.date.toISOString().slice(0, 10) !== (moved ? "2026-04-05" : "2026-04-04") ||
      shift.startAt.toISOString() !== (moved ? "2026-04-04T13:30:00.000Z" : "2026-04-03T13:30:00.000Z") ||
      shift.endAt.toISOString() !== (moved ? "2026-04-04T21:30:00.000Z" : "2026-04-03T21:30:00.000Z") ||
      shift.version !== (moved ? 2 : 1) || period.version !== (moved ? 2 : 1) || count !== 4 ||
      shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-HandoverEmployee006" ||
      published.version !== 1 || published.publications.length !== 1) throw new Error("Unexpected DST move state");
    console.log(JSON.stringify({ verified: true, mode, date: shift.date.toISOString().slice(0, 10),
      startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(), version: shift.version,
      periodVersion: period.version, publishedVersion: published.version }));
  }
} finally {
  await db.$disconnect();
}
