import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unexpected fixture schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Fixture must use an isolated local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shift, draft, published, publicationCount, shiftCount] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
  ]);
  if (shift.version !== 2 || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006") throw new Error("Draft assignment repair did not persist atomically");
  if (process.argv.includes("--expect-note") && shift.publicNote !== "Keep note after transfer") throw new Error("Unsaved note was lost during workforce refresh");
  if (draft.version !== 2 || published.version !== 1 || published.status !== "PUBLISHED" || publicationCount !== 1 || shiftCount !== 3) throw new Error("Unexpected period, publication or Shift mutation");
  console.log(JSON.stringify({ verified: true, shiftVersion: shift.version, employeeId: shift.assignments[0].employeeId,
    draftVersion: draft.version, publishedVersion: published.version, publicationCount, shiftCount }));
} finally {
  await db.$disconnect();
}
