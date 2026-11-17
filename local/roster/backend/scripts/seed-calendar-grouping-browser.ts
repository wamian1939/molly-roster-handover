import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [period, original, grouped, count] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-grouped-shift" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
  ]);
  if (period.storeId !== "browser-store" || period.status !== "DRAFT" || count !== 3
    || original.breakMinutes !== 0 || grouped.breakMinutes !== 0
    || original.startAt.getTime() !== grouped.startAt.getTime()
    || original.endAt.getTime() !== grouped.endAt.getTime()
    || original.shiftRoleId !== grouped.shiftRoleId) {
    throw new Error("Disposable Calendar fixture is not at its three-shift baseline");
  }
  await db.$transaction(async (tx) => {
    await tx.shift.update({ where: { id: grouped.id }, data: { breakMinutes: 30 } });
    for (const item of [
      { id: "qa-grouping-early", employeeId: "browser-HandoverEmployee006", name: "HandoverEmployee006", start: "2026-10-08T22:00:00.000Z", end: "2026-10-09T01:00:00.000Z" },
      { id: "qa-grouping-later", employeeId: "browser-cindy", name: "Cindy", start: "2026-10-08T23:00:00.000Z", end: "2026-10-09T01:00:00.000Z" },
    ]) {
      await tx.shift.create({ data: {
        id: item.id, rosterPeriodId: period.id, storeId: "browser-store", date: new Date("2026-10-09"),
        startAt: new Date(item.start), endAt: new Date(item.end), breakMinutes: 0,
        shiftRoleId: original.shiftRoleId, roleNameSnapshot: original.roleNameSnapshot,
        roleColorSnapshot: original.roleColorSnapshot, createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
        assignments: { create: { employeeId: item.employeeId, employeeNameSnapshot: item.name,
          employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime" } },
      } });
    }
  });
  console.log(JSON.stringify({ schema: state.schema, sourceShifts: 4, visualGroups: 3, mixedBreaks: [0, 30] }));
} finally {
  await db.$disconnect();
}
