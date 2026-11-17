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
  const [shifts, periods, publicationCount, availabilityCount] = await Promise.all([
    db.shift.findMany({ select: { id: true, version: true, rosterPeriodId: true } }),
    db.rosterPeriod.findMany({ select: { id: true, version: true, status: true } }),
    db.rosterPublication.count(),
    db.employeeAvailability.count(),
  ]);
  const baselineShiftIds = ["qa-draft-shift", "qa-draft-grouped-shift", "qa-published-shift"];
  if (shifts.length !== 3 || periods.length !== 2 || publicationCount !== 1 || availabilityCount !== 0
    || baselineShiftIds.some((id) => shifts.find((shift) => shift.id === id)?.version !== 1)
    || periods.find((period) => period.id === "qa-draft-period")?.version !== 1
    || periods.find((period) => period.id === "qa-published-period")?.version !== 1
    || periods.find((period) => period.id === "qa-published-period")?.status !== "PUBLISHED") {
    throw new Error("Cancelled Week DST gestures changed the disposable roster");
  }
  console.log(JSON.stringify({ verified: true, shiftCount: shifts.length, periodCount: periods.length,
    publicationCount, availabilityCount }));
} finally {
  await db.$disconnect();
}
