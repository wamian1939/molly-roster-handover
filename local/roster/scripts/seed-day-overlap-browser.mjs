import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [period, count, existing, role] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { id: { startsWith: "qa-day-overlap-" } } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } }),
  ]);
  if (period.storeId !== "browser-store" || period.status !== "DRAFT" || count !== 503 || existing) {
    throw new Error(`Unexpected disposable 50-employee fixture baseline: status=${period.status} shifts=${count} existing=${existing}`);
  }
  const shifts = [
    { id: "qa-day-overlap-overnight", date: "2026-10-05", startAt: "2026-10-05T11:00:00.000Z", endAt: "2026-10-05T15:00:00.000Z", employeeId: "browser-HandoverEmployee006", name: "HandoverEmployee006" },
    { id: "qa-day-overlap-morning", date: "2026-10-06", startAt: "2026-10-05T14:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z", employeeId: "browser-cindy", name: "Cindy" },
  ];
  await db.$transaction(shifts.map((shift) => db.shift.create({ data: {
    id: shift.id, rosterPeriodId: period.id, storeId: "browser-store", date: new Date(shift.date),
    startAt: new Date(shift.startAt), endAt: new Date(shift.endAt), breakMinutes: 0,
    shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: shift.employeeId, employeeNameSnapshot: shift.name,
      employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime" } },
  } })));
  console.log(JSON.stringify({ seeded: shifts.map((shift) => shift.id), localOverlap: "2026-10-06 01:00-02:00" }));
} finally {
  await db.$disconnect();
}
