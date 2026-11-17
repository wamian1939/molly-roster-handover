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
  if (process.argv[2] === "seed-target") {
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-09"), status: "AVAILABLE",
      startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z") } });
    console.log(JSON.stringify({ seeded: true, targetEmployeeId: "browser-HandoverEmployee006" }));
  } else if (process.argv[2] === "seed-horizontal-target") {
    await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-regular", date: new Date("2026-10-05"), status: "AVAILABLE",
      startAt: new Date("2026-10-04T22:00:00.000Z"), endAt: new Date("2026-10-05T02:00:00.000Z") } });
    console.log(JSON.stringify({ seeded: true, targetEmployeeId: "browser-regular", targetDate: "2026-10-05" }));
  } else {
  const [source, draft, published, shiftCount, publicationCount] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const savedMove = process.argv[2] === "verify-move";
  const horizontalMove = process.argv[2] === "verify-horizontal-move";
  if (source.version !== (savedMove || horizontalMove ? 2 : 1) || source.assignments.length !== 1
    || source.assignments[0]?.employeeId !== (savedMove ? "browser-HandoverEmployee006" : "browser-regular")
    || draft.version !== (savedMove || horizontalMove ? 2 : 1) || published.version !== 1 || shiftCount !== 3 || publicationCount !== 1
    || (horizontalMove && (source.date.toISOString().slice(0, 10) !== "2026-10-05"
      || source.startAt.toISOString() !== "2026-10-04T22:00:00.000Z" || source.endAt.toISOString() !== "2026-10-05T02:00:00.000Z"))) {
    throw new Error("Employee-row drag produced an unexpected fixture state");
  }
  console.log(JSON.stringify({ verified: true, sourceShiftId: source.id, sourceVersion: source.version,
    employeeId: source.assignments[0].employeeId, date: source.date.toISOString().slice(0, 10), draftVersion: draft.version, publishedVersion: published.version,
    shiftCount, publicationCount }));
  }
} finally {
  await db.$disconnect();
}
