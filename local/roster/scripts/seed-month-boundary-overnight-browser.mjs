import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unexpected disposable schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Fixture must use isolated local Roster schema");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const id = "qa-month-boundary-shift";
  if (process.argv[2] === "seed") {
    if (await db.shift.findUnique({ where: { id } })) throw new Error("Fixture Shift already exists");
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
    await db.rosterPeriod.create({ data: { id: "qa-month-boundary-period", storeId: "browser-store",
      startDate: new Date("2026-10-26T00:00:00.000Z"), endDate: new Date("2026-11-01T00:00:00.000Z"),
      cycleType: "WEEK", createdByAccountId: "qa-admin" } });
    await db.shift.create({ data: { id, rosterPeriodId: "qa-month-boundary-period", storeId: "browser-store",
      date: new Date("2026-10-31T00:00:00.000Z"), startAt: new Date("2026-10-31T11:00:00.000Z"),
      endAt: new Date("2026-10-31T15:00:00.000Z"), breakMinutes: 0, shiftRoleId: role.id,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
        employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR",
        employmentTypeSnapshot: "FullTime",
      } } } });
    console.log(JSON.stringify({ seeded: true, shiftId: id }));
  } else if (process.argv[2] === "verify") {
    const [shift, period, publications] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id }, include: { assignments: true } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-month-boundary-period" } }),
      db.rosterPublication.count({ where: { rosterPeriodId: "qa-month-boundary-period" } }),
    ]);
    if (shift.date.toISOString() !== "2026-10-31T00:00:00.000Z"
      || shift.startAt.toISOString() !== "2026-10-31T11:00:00.000Z"
      || shift.endAt.toISOString() !== "2026-10-31T15:00:00.000Z" || shift.version !== 1
      || shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-regular"
      || period.status !== "DRAFT" || period.version !== 1 || publications !== 0) {
      throw new Error("Month-boundary Shift or period was changed");
    }
    console.log(JSON.stringify({ verified: true, shiftId: id, startAt: shift.startAt.toISOString(),
      endAt: shift.endAt.toISOString(), version: shift.version, periodVersion: period.version, publications }));
  } else throw new Error("Expected seed or verify");
} finally {
  await db.$disconnect();
}
