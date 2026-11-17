import "dotenv/config";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
    url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, publication] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const created = shifts.filter((shift) => shift.id !== "qa-draft-shift" && shift.id !== "qa-draft-grouped-shift" && shift.id !== "qa-published-shift");
  if (shifts.length !== 4 || created.length !== 1 || draft.version !== 2 ||
      created[0].date.toISOString().slice(0, 10) !== "2026-10-09" ||
      created[0].startAt.toISOString() !== "2026-10-09T02:00:00.000Z" ||
      created[0].endAt.toISOString() !== "2026-10-09T02:30:00.000Z" ||
      created[0].assignments.length !== 1 || created[0].assignments[0].employeeId !== "browser-HandoverEmployee006" ||
      publication.periodVersion !== 1 ||
      JSON.stringify(publication.snapshot).includes("browser-HandoverEmployee006")) {
    throw new Error("Browser save did not persist exactly once or published history changed");
  }
  console.log(JSON.stringify({ verified: true, schema: state.schema, createdShifts: 1,
    localTime: "2026-10-09 13:00-13:30 Australia/Sydney", startUtc: created[0].startAt.toISOString(),
    endUtc: created[0].endAt.toISOString(), employeeId: created[0].assignments[0].employeeId,
    draftVersion: draft.version, publishedSnapshotUnchanged: true }));
} finally {
  await db.$disconnect();
}
