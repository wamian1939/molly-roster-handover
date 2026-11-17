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
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const overnight = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === "2026-10-09"
    && shift.startAt.toISOString() === "2026-10-09T11:00:00.000Z"
    && shift.endAt.toISOString() === "2026-10-09T15:00:00.000Z"
    && shift.assignments.length === 1 && shift.assignments[0].employeeId === "browser-HandoverEmployee006");
  if (shifts.length !== 4 || overnight.length !== 1 || overnight[0].version !== 1
    || overnight[0].rosterPeriodId !== draft.id || draft.version !== 2 || draft.status !== "DRAFT"
    || published.version !== 1 || published.status !== "PUBLISHED" || publications !== 1) {
    throw new Error("Week continuation browser gesture changed disposable roster state");
  }
  console.log(JSON.stringify({ verified: true, shiftId: overnight[0].id, shifts: shifts.length,
    employeeId: overnight[0].assignments[0].employeeId, shiftVersion: overnight[0].version,
    draftVersion: draft.version, publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
