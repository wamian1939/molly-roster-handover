import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe disposable schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unexpected database target");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-10") } });
  if (rows.length !== 1 || rows[0].startAt.toISOString() !== "2026-10-09T23:00:00.000Z" || rows[0].endAt.toISOString() !== "2026-10-10T07:00:00.000Z") throw new Error("Newer Availability row was not retained");
  const [shifts, publications] = await Promise.all([db.shift.count(), db.rosterPublication.count()]);
  if (shifts !== 3 || publications !== 1) throw new Error("Fixture Shift or publication changed");
  console.log(JSON.stringify({ verified: true, availabilityRows: rows.length, startAt: rows[0].startAt.toISOString(), shifts, publications }));
} finally {
  await db.$disconnect();
}
