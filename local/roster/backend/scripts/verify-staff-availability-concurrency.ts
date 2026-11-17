import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unexpected disposable schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe database target");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-10") } });
  if (rows.length !== 1 || rows[0]!.startAt?.toISOString() !== "2026-10-09T22:00:00.000Z" || rows[0]!.endAt?.toISOString() !== "2026-10-10T06:00:00.000Z") throw new Error("The stale form overwrote the winning Availability");
  const [shiftCount, publicationCount] = await Promise.all([
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId: "browser-store" } } }),
  ]);
  if (shiftCount !== 3 || publicationCount !== 1) throw new Error("Unrelated Roster state changed");
  console.log(JSON.stringify({ verified: true, schema: state.schema, rows: rows.length, startAt: rows[0]!.startAt?.toISOString(), endAt: rows[0]!.endAt?.toISOString(), shiftCount, publicationCount }));
} finally {
  await db.$disconnect();
}
