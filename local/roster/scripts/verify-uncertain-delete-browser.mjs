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
  const [shifts, draft, published, publications] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.findMany(),
  ]);
  if (shifts.length !== 2 || shifts.some((shift) => shift.id === "qa-draft-shift")
    || !shifts.some((shift) => shift.id === "qa-draft-grouped-shift" && shift.assignments[0]?.employeeId === "browser-training")
    || draft.version !== 2 || draft.status !== "DRAFT"
    || published.version !== 1 || published.status !== "PUBLISHED"
    || publications.length !== 1 || publications[0].periodVersion !== 1) {
    throw new Error("Delete result, adjacent Shift, or published history changed unexpectedly");
  }
  console.log(JSON.stringify({ verified: true, totalShifts: shifts.length, deletedShiftAbsent: true,
    adjacentShiftRetained: true, draftVersion: draft.version, publishedVersion: published.version,
    publishedSnapshots: publications.length }));
} finally {
  await db.$disconnect();
}
