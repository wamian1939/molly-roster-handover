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
  const availability = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-cindy" } });
  const shifts = await db.shift.findMany({ where: { storeId: "browser-store", assignments: { some: { employeeId: "browser-cindy" } } }, include: { assignments: true, rosterPeriod: true } });
  const templates = await db.availabilityTemplate.findMany({ where: { storeId: "browser-store", name: "QA overnight availability" } });
  const expected = ["2026-10-09", "2026-10-16"];
  if (availability.length !== 2 || expected.some((date) => {
    const row = availability.find((item) => item.date.toISOString() === `${date}T00:00:00.000Z`);
    return !row || row.startAt?.toISOString() !== `${date}T11:00:00.000Z` || row.endAt?.toISOString() !== `${date}T15:00:00.000Z`;
  })) throw new Error("Availability and template application were not persisted as overnight intervals");
  if (templates.length !== 1 || !Array.isArray(templates[0].slots) || templates[0].slots.length !== 1
    || templates[0].slots[0].endNextDay !== true) throw new Error("Overnight Availability template flag was not persisted");
  if (shifts.length !== 1 || shifts[0].startAt.toISOString() !== "2026-10-09T11:00:00.000Z"
    || shifts[0].endAt.toISOString() !== "2026-10-09T15:00:00.000Z"
    || shifts[0].rosterPeriod.status !== "DRAFT" || shifts[0].assignments.length !== 1) throw new Error("Overnight shift does not match browser save");
  console.log(JSON.stringify({ verified: true, schema: fixture.schema, availabilityCount: availability.length, availabilityTemplateCount: templates.length, shiftCount: shifts.length, startAt: shifts[0].startAt.toISOString(), endAt: shifts[0].endAt.toISOString() }));
} finally {
  await db.$disconnect();
}
