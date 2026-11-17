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
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
  url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Requires the exact disposable Roster schema");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [source, role, shifts, periods, publications, availability] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front" } }),
    db.shift.count(), db.rosterPeriod.count(), db.rosterPublication.count(), db.employeeAvailability.count(),
  ]);
  if (source.storeId !== "browser-store" || shifts !== 3 || periods !== 2 || publications !== 1 || availability !== 0) throw new Error("Unexpected fixture baseline");
  const period = await db.rosterPeriod.create({ data: {
    id: "qa-copy-conflict-period", storeId: "browser-store", startDate: new Date("2026-10-19"),
    endDate: new Date("2026-10-25"), cycleType: "WEEK", createdByAccountId: "qa-admin",
  } });
  await db.shift.create({ data: {
    id: "qa-copy-conflict-shift", rosterPeriodId: period.id, storeId: "browser-store", date: new Date("2026-10-23"),
    startAt: new Date("2026-10-22T22:00:00.000Z"), endAt: new Date("2026-10-23T02:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
      employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR",
      employmentTypeSnapshot: "FullTime",
    } },
  } });
  await db.employeeAvailability.createMany({ data: ["browser-regular", "browser-HandoverEmployee006"].map((employeeId) => ({
    storeId: "browser-store", employeeId, date: new Date("2026-10-23"), status: "AVAILABLE",
    startAt: new Date("2026-10-22T22:00:00.000Z"), endAt: new Date("2026-10-23T06:00:00.000Z"),
  })) });
  console.log(JSON.stringify({ seeded: true, schema: state.schema, targetDate: "2026-10-23", conflictEmployee: "browser-regular" }));
} finally { await db.$disconnect(); }
