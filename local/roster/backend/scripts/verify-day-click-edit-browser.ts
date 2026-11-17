import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, periods, publications, availability] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true, status: true } }),
    db.rosterPublication.findMany({ select: { rosterPeriodId: true, periodVersion: true } }),
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" }, select: { employeeId: true, date: true } }),
  ]);
  const edited = shifts.find((shift) => shift.id === "qa-bhs-day-long");
  const draft = periods.find((period) => period.id === "qa-draft-period");
  const published = periods.find((period) => period.id === "qa-published-period");
  if (shifts.length !== 8 || !edited || edited.startAt.toISOString() !== "2026-10-10T01:00:00.000Z"
    || edited.endAt.toISOString() !== "2026-10-10T11:00:00.000Z" || edited.version !== 3 || edited.breakMinutes !== 60
    || edited.assignments.length !== 1 || edited.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
    || shifts.filter((shift) => shift.id !== edited.id).some((shift) => shift.version !== 1)
    || draft?.version !== 3 || published?.version !== 1 || published.status !== "PUBLISHED"
    || publications.length !== 1 || publications[0]?.rosterPeriodId !== published.id || publications[0]?.periodVersion !== 1
    || availability.length !== 1 || availability[0]?.employeeId !== "browser-HandoverEmployee006"
    || availability[0]?.date.toISOString().slice(0, 10) !== "2026-10-10") {
    throw new Error("Day click-edit did not preserve the exact Shift and publication boundaries");
  }
  console.log(JSON.stringify({ schema: fixture.schema, shiftId: edited.id, startAt: edited.startAt,
    endAt: edited.endAt, shiftVersion: edited.version, employeeId: edited.assignments[0].employeeId,
    shifts: shifts.length, draftVersion: draft.version, publishedVersion: published.version, publications: publications.length }));
} finally {
  await db.$disconnect();
}
