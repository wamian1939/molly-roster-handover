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
  const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store" }, orderBy: { date: "asc" } });
  const dates = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
  if (rows.length !== 7 || rows.some((row, index) => row.employeeId !== "browser-cindy" || row.status !== "AVAILABLE"
    || row.date.toISOString() !== `${dates[index]}T00:00:00.000Z`
    || row.startAt?.toISOString() !== `${dates[index]}T07:00:00.000Z`
    || row.endAt?.toISOString() !== `${dates[index]}T16:00:00.000Z`)) throw new Error("Browser Availability save did not match seven overnight store-hour intervals");
  const [shifts, draft, published] = await Promise.all([
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
  ]);
  if (shifts !== 3 || draft.version !== 1 || published.version !== 1 || published.status !== "PUBLISHED") throw new Error("Availability flow changed shift or period data");
  console.log(JSON.stringify({ verified: true, schema: fixture.schema, cindyAvailability: rows.length, berlinAvailability: 0, shifts, draftVersion: draft.version, publishedVersion: published.version }));
} finally {
  await db.$disconnect();
}
