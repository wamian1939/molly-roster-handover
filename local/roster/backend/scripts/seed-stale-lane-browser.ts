import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) || url.searchParams.get("schema") !== state.schema
  || url.port !== "5433" || url.pathname !== "/molly_roster" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Expected guarded disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (process.argv[2] === "seed") {
    const source = await db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } });
    if (source.storeId !== "browser-store" || source.version !== 1) throw new Error("Unexpected source Shift");
    const role = await db.shiftRole.create({ data: { storeId: "browser-store", code: "qa-stale-lane", nameZh: "QA Changed", colorToken: "#7c3aed" } });
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-regular", date: new Date("2026-10-09"), status: "AVAILABLE",
      startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z") } });
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-cindy", date: new Date("2026-10-09"), status: "AVAILABLE",
      startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z") } });
    console.log(JSON.stringify({ seeded: true, shiftId: source.id, roleId: role.id }));
  } else if (process.argv[2] === "verify") {
    const [shift, period] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    ]);
    if (shift.version !== 2 || shift.roleNameSnapshot !== "QA Changed" || shift.assignments.length !== 1
      || shift.assignments[0]?.employeeId !== "browser-regular" || period.version !== 2) throw new Error("Stale drag changed authoritative Shift");
    console.log(JSON.stringify({ verified: true, shiftId: shift.id, shiftVersion: shift.version, roleName: shift.roleNameSnapshot,
      employeeId: shift.assignments[0].employeeId, periodVersion: period.version }));
  } else if (process.argv[2] === "reset") {
    const source = await db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } });
    const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
    const originalRole = await db.shiftRole.findFirstOrThrow({ where: { storeId: null, code: "qa-front" } });
    if (source.version !== 2 || period.version !== 2 || source.assignments.length !== 1 || source.assignments[0]?.employeeId !== "browser-regular") {
      throw new Error("Unexpected stale-lane fixture state; refusing reset");
    }
    await db.$transaction([
      db.shift.update({ where: { id: source.id }, data: { shiftRoleId: originalRole.id, roleNameSnapshot: originalRole.nameZh, roleColorSnapshot: originalRole.colorToken, version: 1 } }),
      db.rosterPeriod.update({ where: { id: period.id }, data: { version: 1 } }),
    ]);
    console.log(JSON.stringify({ reset: true, shiftId: source.id, version: 1 }));
  } else {
    throw new Error("Expected seed, verify or reset");
  }
} finally {
  await db.$disconnect();
}
