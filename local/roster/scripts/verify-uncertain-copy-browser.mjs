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
  const [shifts, draft, published, copied, publications] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPeriod.findFirstOrThrow({ where: { storeId: "browser-store", startDate: new Date("2026-10-19") } }),
    db.rosterPublication.findMany(),
  ]);
  const day = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === "2026-10-10");
  const week = shifts.filter((shift) => shift.rosterPeriodId === copied.id);
  const afterDelete = process.argv.includes("--after-delete");
  if (shifts.length !== (afterDelete ? 4 : 6) || day.length !== (afterDelete ? 0 : 2) || week.length !== 1
    || draft.status !== "DRAFT" || draft.version !== (afterDelete ? 3 : 2)
    || published.status !== "PUBLISHED" || published.version !== 1
    || copied.status !== "DRAFT" || copied.version !== 1
    || publications.length !== 1 || publications[0].periodVersion !== 1) {
    throw new Error("Copy outcome, duplicate count, or published snapshot changed");
  }
  console.log(JSON.stringify({ verified: true, totalShifts: shifts.length, copiedDayShifts: day.length,
    copiedPeriodShifts: week.length, draftVersion: draft.version, publishedVersion: published.version,
    publishedSnapshots: publications.length }));
} finally {
  await db.$disconnect();
}
