import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [count, role, period] = await Promise.all([
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
  ]);
  if (count !== 3 || period.status !== "DRAFT" || period.version !== 1) throw new Error("Unexpected fixture baseline");
  await db.shift.create({ data: {
    id: "qa-conflicting-HandoverEmployee006-shift", rosterPeriodId: period.id, storeId: "browser-store",
    date: new Date("2026-10-09"), startAt: new Date("2026-10-08T23:00:00.000Z"), endAt: new Date("2026-10-09T01:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime" } },
  } });
  console.log(JSON.stringify({ seeded: true, conflictId: "qa-conflicting-HandoverEmployee006-shift", sourceId: "qa-draft-shift" }));
} finally {
  await db.$disconnect();
}
