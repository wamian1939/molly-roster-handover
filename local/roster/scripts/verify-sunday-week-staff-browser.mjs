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

const expected = Array.from({ length: 7 }, (_, index) => `2026-10-${String(25 + index).padStart(2, "0")}`);
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [settings, rows, shifts, publications] = await Promise.all([
    db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } }),
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" }, orderBy: { date: "asc" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  const dates = rows.map((row) => row.date.toISOString().slice(0, 10));
  if (settings.weekStartsOn !== 0 || JSON.stringify(dates) !== JSON.stringify(expected)
    || rows.some((row) => row.status !== "AVAILABLE") || shifts !== 3 || publications !== 1) {
    throw new Error("Disposable Sunday-start browser result did not match the database");
  }
  console.log(JSON.stringify({ verified: true, weekStartsOn: settings.weekStartsOn, dates,
    availableRows: rows.length, unchangedShifts: shifts, unchangedPublications: publications }));
} finally {
  await db.$disconnect();
}
