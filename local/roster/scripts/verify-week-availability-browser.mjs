import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable schema target");

const db = new PrismaClient({ datasources: { db: { url: state.isolatedUrl } } });
try {
  const [rows, draft, published, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" }, orderBy: { employeeId: "asc" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true } }),
    db.rosterPublication.findMany({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const HandoverEmployee006 = rows.find((row) => row.employeeId === "browser-HandoverEmployee006");
  const cindy = rows.find((row) => row.employeeId === "browser-cindy");
  if (rows.length !== 2 || HandoverEmployee006?.status !== "AVAILABLE" || HandoverEmployee006.startAt?.toISOString() !== "2026-10-09T11:00:00.000Z"
    || HandoverEmployee006.endAt?.toISOString() !== "2026-10-09T15:00:00.000Z" || cindy?.status !== "UNAVAILABLE"
    || cindy.startAt?.toISOString() !== "2026-10-10T03:00:00.000Z" || cindy.endAt?.toISOString() !== "2026-10-10T05:00:00.000Z"
    || draft.status !== "DRAFT" || draft.version !== 1 || published.status !== "PUBLISHED" || published.version !== 1
    || shifts.length !== 3 || shifts.some((shift) => shift.version !== 1) || publications.length !== 1) {
    throw new Error("Week Availability browser state did not match the guarded fixture");
  }
  console.log(JSON.stringify({ verified: true, availabilityRows: rows.length, draftVersion: draft.version,
    publishedVersion: published.version, shiftCount: shifts.length, publicationCount: publications.length }));
} finally {
  await db.$disconnect();
}
