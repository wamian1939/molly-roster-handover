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
  const [settings, periods, shifts, publications, availability] = await Promise.all([
    db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } }),
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, orderBy: { startDate: "asc" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true }, orderBy: { date: "asc" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: { gte: new Date("2026-10-26") } } }),
  ]);
  const fortnight = periods.filter((period) => period.cycleType === "FORTNIGHT");
  const dates = ["2026-10-29", "2026-10-30", "2026-11-10", "2026-11-12", "2026-11-13"];
  const copied = dates.map((date) => shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === date));
  const source = copied[0][0];
  if (settings.cycleType !== "FORTNIGHT" || settings.fortnightAnchorDate !== "2026-10-26"
    || fortnight.length !== 2 || periods.length !== 4 || shifts.length !== 8 || publications !== 1 || availability !== 5
    || fortnight[0].startDate.toISOString().slice(0, 10) !== "2026-10-26"
    || fortnight[0].endDate.toISOString().slice(0, 10) !== "2026-11-08" || fortnight[0].version !== 3
    || fortnight[1].startDate.toISOString().slice(0, 10) !== "2026-11-09"
    || fortnight[1].endDate.toISOString().slice(0, 10) !== "2026-11-22" || fortnight[1].version !== 2
    || periods.find((period) => period.id === "qa-published-period")?.version !== 1
    || copied.some((rows) => rows.length !== 1 || rows[0].assignments.length !== 1 || rows[0].assignments[0].employeeId !== "browser-HandoverEmployee006")
    || !source || copied.some((rows, index) => rows[0].startAt.getTime() - source.startAt.getTime() !== [0, 1, 12, 14, 15][index] * 86_400_000)) {
    throw new Error("Fortnight browser operations did not persist as one 14-day cycle with stable history");
  }
  console.log(JSON.stringify({ verified: true, anchor: settings.fortnightAnchorDate,
    cycles: fortnight.map((period) => [period.startDate.toISOString().slice(0, 10), period.endDate.toISOString().slice(0, 10), period.version]),
    shiftDates: dates, canonicalEmployeeId: "browser-HandoverEmployee006", publishedVersion: 1, publicationCount: publications }));
} finally {
  await db.$disconnect();
}
