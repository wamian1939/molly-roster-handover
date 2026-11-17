import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
  url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, published, total, publications] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-10") }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  const shift = shifts[0];
  if (shifts.length !== 1 || shift.startAt.toISOString() !== "2026-10-09T22:00:00.000Z" ||
    shift.endAt.toISOString() !== "2026-10-09T23:00:00.000Z" || shift.assignments.length !== 1 ||
    shift.assignments[0].employeeId !== "browser-HandoverEmployee006" || shift.version !== 1 ||
    draft.version !== 2 || published.version !== 1 || total !== 4 || publications !== 1) {
    throw new Error("Formal-position picker did not save exactly one canonical assignment");
  }
  console.log(JSON.stringify({ verified: true, shiftId: shift.id, employeeId: shift.assignments[0].employeeId,
    startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(), total, draftVersion: draft.version,
    publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
