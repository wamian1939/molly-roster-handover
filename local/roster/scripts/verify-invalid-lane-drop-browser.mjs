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
  const [count, source, conflict, draft, published] = await Promise.all([
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-conflicting-HandoverEmployee006-shift" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
  ]);
  if (count !== 4 || source.version !== 1 || source.assignments.length !== 1 || source.assignments[0].employeeId !== "browser-regular"
    || conflict.version !== 1 || conflict.assignments.length !== 1 || conflict.assignments[0].employeeId !== "browser-HandoverEmployee006"
    || draft.version !== 1 || published.version !== 1 || draft.status !== "DRAFT" || published.status !== "PUBLISHED") {
    throw new Error("Invalid drop changed source, target, or period rows");
  }
  console.log(JSON.stringify({ verified: true, shifts: count, sourceVersion: source.version,
    sourceEmployeeId: source.assignments[0].employeeId, targetEmployeeId: conflict.assignments[0].employeeId,
    draftVersion: draft.version, publishedVersion: published.version }));
} finally {
  await db.$disconnect();
}
