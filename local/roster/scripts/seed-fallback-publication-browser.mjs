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
  const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } });
  const shift = await db.shift.findUniqueOrThrow({ where: { id: "qa-fallback-copy-source" }, include: { assignments: true } });
  if (period.storeId !== "browser-store" || shift.rosterPeriodId !== period.id
    || shift.startAt.toISOString() !== "2026-04-04T15:30:00.000Z"
    || shift.endAt.toISOString() !== "2026-04-04T16:30:00.000Z"
    || shift.assignments.length !== 1
    || await db.rosterPublication.count({ where: { rosterPeriodId: period.id } })) {
    throw new Error("Unexpected fallback publication fixture state");
  }
  const snapshot = {
    schemaVersion: 1, timezone: "Australia/Sydney", store: { id: "browser-store", name: "Browser Acceptance" },
    period: { id: period.id, storeId: period.storeId, startDate: "2026-03-30", endDate: "2026-04-05", cycleType: "WEEK", status: "PUBLISHED", version: period.version },
    publishedBy: { accountId: "qa-admin", displayName: "QA Admin" },
    shifts: [{ id: shift.id, rosterPeriodId: period.id, storeId: period.storeId, date: "2026-04-05",
      startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(), breakMinutes: shift.breakMinutes,
      shiftRoleId: shift.shiftRoleId, roleNameSnapshot: shift.roleNameSnapshot, roleColorSnapshot: shift.roleColorSnapshot,
      publicNote: shift.publicNote, internalNote: shift.internalNote,
      assignments: shift.assignments.map((assignment) => ({ id: assignment.id, employeeId: assignment.employeeId,
        employeeNameSnapshot: assignment.employeeNameSnapshot, employeeTypeSnapshot: assignment.employeeTypeSnapshot,
        employmentTypeSnapshot: assignment.employmentTypeSnapshot, officialScoreSnapshot: null, tierSnapshot: null })) }],
  };
  const publication = await db.rosterPublication.create({ data: { rosterPeriodId: period.id, periodVersion: period.version,
    publishedByAccountId: "qa-admin", publishedAt: new Date("2026-04-01T00:00:00.000Z"), snapshot } });
  console.log(JSON.stringify({ seeded: true, schema: fixture.schema, publicationId: publication.id }));
} finally {
  await db.$disconnect();
}
