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
  const [shift, draft, published, publicationCount, shiftCount, periodCount, targetShiftCount] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPeriod.count({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store", date: { in: [new Date("2026-10-10"), new Date("2026-10-23")] } } }),
  ]);
  if (shift.version !== 1 || shift.date.toISOString() !== "2026-10-09T00:00:00.000Z" || shift.assignments.length !== 1
    || shift.assignments[0]?.employeeId !== "browser-regular") throw new Error("Rejected drag changed the original Shift");
  if (draft.version !== 1 || published.version !== 1 || published.status !== "PUBLISHED" || publicationCount !== 1 || shiftCount !== 3 || periodCount !== 2 || targetShiftCount !== 0) {
    throw new Error("Rejected drag changed period or publication state");
  }
  console.log(JSON.stringify({ verified: true, shiftVersion: shift.version, employeeId: shift.assignments[0].employeeId,
    draftVersion: draft.version, publishedVersion: published.version, publicationCount, shiftCount, periodCount, targetShiftCount }));
} finally {
  await db.$disconnect();
}
