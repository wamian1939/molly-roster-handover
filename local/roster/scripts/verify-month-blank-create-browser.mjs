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
  const [draft, published, shifts] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
  ]);
  const created = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === "2026-10-10");
  const source = shifts.find((shift) => shift.id === "qa-draft-shift");
  if (draft.version !== 2 || draft.status !== "DRAFT" || published.version !== 1 || published.status !== "PUBLISHED"
    || shifts.length !== 4 || created.length !== 1 || created[0].id === "qa-draft-shift"
    || created[0].startAt.toISOString() !== "2026-10-09T22:00:00.000Z"
    || created[0].endAt.toISOString() !== "2026-10-09T23:00:00.000Z"
    || created[0].publicNote !== "Month blank create QA"
    || created[0].assignments.length !== 1 || created[0].assignments[0].employeeId !== "browser-HandoverEmployee006"
    || !source || source.assignments.length !== 1 || source.assignments[0].employeeId !== "browser-regular") {
    throw new Error("Month create did not persist exactly once or changed source/published history");
  }
  console.log(JSON.stringify({ verified: true, createdId: created[0].id,
    employeeId: created[0].assignments[0].employeeId, draftVersion: draft.version, publishedVersion: published.version,
    shiftCount: shifts.length, startAt: created[0].startAt.toISOString(), endAt: created[0].endAt.toISOString() }));
} finally {
  await db.$disconnect();
}
