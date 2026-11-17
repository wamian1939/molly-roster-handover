import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, periods, publicationCount, availability] = await Promise.all([
    db.shift.findMany({ include: { assignments: true } }),
    db.rosterPeriod.findMany(),
    db.rosterPublication.count(),
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-04-05") } }),
  ]);
  const fallback = shifts.find((shift) => shift.publicNote === "DST upward QA");
  const fallbackPeriod = periods.find((period) => period.id === fallback?.rosterPeriodId);
  const ordinary = shifts.find((shift) => shift.publicNote === "Upward drag QA");
  const draft = periods.find((period) => period.id === "qa-draft-period");
  const published = periods.find((period) => period.id === "qa-published-period");
  const baselineIds = ["qa-draft-shift", "qa-draft-grouped-shift", "qa-published-shift"];
  if (shifts.length !== 5 || periods.length !== 3 || publicationCount !== 1 || !fallback
    || fallback.storeId !== "browser-store" || fallback.date.toISOString().slice(0, 10) !== "2026-04-05"
    || fallback.startAt.toISOString() !== "2026-04-04T15:00:00.000Z"
    || fallback.endAt.toISOString() !== "2026-04-04T17:30:00.000Z"
    || fallback.version !== 1 || fallback.roleNameSnapshot !== "QA Front"
    || fallback.assignments.length !== 1 || fallback.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
    || fallbackPeriod?.status !== "DRAFT" || fallbackPeriod.version !== 2
    || ordinary?.startAt.toISOString() !== "2026-10-09T23:00:00.000Z"
    || ordinary.endAt.toISOString() !== "2026-10-10T00:00:00.000Z"
    || draft?.version !== 2 || published?.version !== 1 || published.status !== "PUBLISHED"
    || baselineIds.some((id) => shifts.find((shift) => shift.id === id)?.version !== 1)
    || availability.length !== 1 || availability[0]?.startAt.toISOString() !== "2026-04-04T14:00:00.000Z"
    || availability[0]?.endAt.toISOString() !== "2026-04-04T18:00:00.000Z") {
    throw new Error("DST upward browser run altered unexpected Roster records");
  }
  console.log(JSON.stringify({ verified: true, shifts: shifts.length, periods: periods.length,
    fallbackStartAt: fallback.startAt.toISOString(), fallbackEndAt: fallback.endAt.toISOString(),
    fallbackEmployeeId: fallback.assignments[0].employeeId, publicationCount }));
} finally {
  await db.$disconnect();
}
