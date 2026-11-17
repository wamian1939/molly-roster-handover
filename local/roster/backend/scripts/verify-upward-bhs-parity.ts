import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe QA schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the isolated local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, published] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store", publicNote: "Upward BHS parity QA" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, include: { publications: true } }),
  ]);
  if (shifts.length !== 1) throw new Error(`Expected exactly one parity Shift, found ${shifts.length}`);
  const shift = shifts[0];
  if (shift.date.toISOString().slice(0, 10) !== "2026-10-10" ||
    shift.startAt.toISOString() !== "2026-10-09T22:00:00.000Z" ||
    shift.endAt.toISOString() !== "2026-10-09T23:30:00.000Z" ||
    shift.rosterPeriodId !== draft.id || shift.version !== 1 || draft.version !== 2 ||
    shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-HandoverEmployee006" ||
    published.version !== 1 || published.publications.length !== 1) {
    throw new Error("Saved Day selection, employee, or published history differs from the browser preview");
  }
  console.log(JSON.stringify({ verified: true, id: shift.id, date: "2026-10-10", startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(), employeeId: shift.assignments[0].employeeId, draftVersion: draft.version,
    publishedVersion: published.version, publications: published.publications.length }));
} finally {
  await db.$disconnect();
}
