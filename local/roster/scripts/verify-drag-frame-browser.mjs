import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const employeeCount = Number(process.argv[2] ?? 500);
if (![50, 100, 500].includes(employeeCount)) throw new Error("Expected 50, 100, or 500 employees");
const expectedBenchmarkShifts = employeeCount * 10;
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
  const [benchmarkShifts, benchmarkAssignments, source, draft, published] = await Promise.all([
    db.shift.count({ where: { id: { startsWith: "bench-shift-" } } }),
    db.shiftAssignment.count({ where: { shift: { id: { startsWith: "bench-shift-" } } } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
  ]);
  if (benchmarkShifts !== expectedBenchmarkShifts || benchmarkAssignments !== expectedBenchmarkShifts || source.version !== 1
    || source.assignments.length !== 1 || source.assignments[0].employeeId !== "browser-regular"
    || draft.version !== 1 || published.version !== 1
    || draft.status !== "DRAFT" || published.status !== "PUBLISHED") {
    throw new Error(`Canceled performance drag changed Roster rows or fixture counts: ${JSON.stringify({ benchmarkShifts, benchmarkAssignments, sourceVersion: source.version, sourceAssignments: source.assignments.length, draftVersion: draft.version, publishedVersion: published.version, draftStatus: draft.status, publishedStatus: published.status })}`);
  }
  console.log(JSON.stringify({ verified: true, benchmarkShifts, benchmarkAssignments,
    sourceVersion: source.version, draftVersion: draft.version, publishedVersion: published.version }));
} finally {
  await db.$disconnect();
}
