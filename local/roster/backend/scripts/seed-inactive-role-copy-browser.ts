import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) || url.searchParams.get("schema") !== state.schema
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/molly_roster") {
  throw new Error("Expected guarded disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (process.argv[2] === "verify") {
    const [source, targetCount, period, inactiveRole] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
      db.shift.count({ where: { storeId: "browser-store", date: new Date("2026-10-10") } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.shiftRole.findFirstOrThrow({ where: { storeId: "browser-store", code: "qa-inactive-copy" } }),
    ]);
    if (targetCount !== 0 || source.shiftRoleId !== inactiveRole.id || inactiveRole.isActive || source.assignments.length !== 1 || period.version !== 1) {
      throw new Error("Copy rejection changed the source or target fixture");
    }
    console.log(JSON.stringify({ verified: true, sourceShiftId: source.id, sourceVersion: source.version, periodVersion: period.version,
      targetShifts: targetCount, inactiveRoleId: inactiveRole.id }));
    process.exitCode = 0;
  } else if (process.argv[2] === undefined || process.argv[2] === "seed") {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } });
  if (shift.storeId !== "browser-store" || shift.date.toISOString().slice(0, 10) !== "2026-10-09") throw new Error("Unexpected browser fixture Shift");
  const role = await db.shiftRole.create({ data: { storeId: "browser-store", code: "qa-inactive-copy", nameZh: "Inactive copy QA", colorToken: "#b45309", isActive: false } });
  await db.shift.update({ where: { id: shift.id }, data: { shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken } });
  for (const employeeId of ["browser-regular", "browser-training"]) {
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId, date: new Date("2026-10-10"), status: "AVAILABLE",
      startAt: new Date("2026-10-09T22:00:00.000Z"), endAt: new Date("2026-10-10T02:00:00.000Z") } });
  }
  console.log(JSON.stringify({ seeded: true, storeId: "browser-store", sourceShiftId: shift.id, roleId: role.id }));
  } else {
    throw new Error("Expected seed or verify");
  }
} finally {
  await db.$disconnect();
}
