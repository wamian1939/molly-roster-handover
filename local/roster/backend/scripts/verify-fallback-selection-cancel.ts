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
  const clicked = process.argv.includes("--clicked");
  const saved = clicked || process.argv.includes("--saved");
  const [fallback, fallbackShifts, allShifts, published, publications] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } }),
    db.shift.findMany({ where: { rosterPeriodId: "qa-fallback-period" }, include: { assignments: true } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count(),
  ]);
  const shift = fallbackShifts[0];
  if (fallback.version !== (saved ? 2 : 1) || fallbackShifts.length !== (saved ? 1 : 0) ||
    allShifts !== (saved ? 4 : 3) || published.version !== 1 || publications !== 1 ||
    (saved && (shift.date.toISOString().slice(0, 10) !== "2026-04-05" ||
      shift.startAt.toISOString() !== (clicked ? "2026-04-04T15:30:00.000Z" : "2026-04-04T16:00:00.000Z") ||
      shift.endAt.toISOString() !== (clicked ? "2026-04-04T16:30:00.000Z" : "2026-04-04T17:00:00.000Z") || shift.version !== 1 ||
      shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-HandoverEmployee006"))) {
    throw new Error("Fall-back selection did not preserve the expected roster state");
  }
  console.log(JSON.stringify({ verified: true, saved, clicked, fallbackVersion: fallback.version,
    fallbackShifts: fallbackShifts.length, allShifts, publishedVersion: published.version, publications,
    startAt: shift?.startAt.toISOString(), endAt: shift?.endAt.toISOString() }));
} finally {
  await db.$disconnect();
}
