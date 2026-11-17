import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable schema target");

const db = new PrismaClient({ datasources: { db: { url: state.isolatedUrl } } });
try {
  const [period, shiftCount, assignmentCount, availabilityCount, sample, publicationCount] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "valid-calendar-period" } }),
    db.shift.count({ where: { rosterPeriodId: "valid-calendar-period" } }),
    db.shiftAssignment.count({ where: { shift: { rosterPeriodId: "valid-calendar-period" } } }),
    db.employeeAvailability.count({ where: { storeId: "browser-store", date: { gte: new Date("2026-10-19"), lte: new Date("2026-10-23") } } }),
    db.shift.findUniqueOrThrow({ where: { id: "valid-calendar-shift-0-499-0" }, include: { assignments: true } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  if (period.status !== "DRAFT" || period.version !== 1 || shiftCount !== 5000 || assignmentCount !== 5000
    || availabilityCount !== 2500 || sample.version !== 1 || sample.assignments.length !== 1
    || sample.assignments[0].employeeId !== "valid-calendar-employee-0499" || publicationCount !== 1) {
    throw new Error("500-person Week performance browser pass modified the disposable fixture");
  }
  console.log(JSON.stringify({ verified: true, periodVersion: period.version, shiftCount,
    assignmentCount, availabilityCount, sampleEmployeeId: sample.assignments[0].employeeId, publicationCount }));
} finally {
  await db.$disconnect();
}
