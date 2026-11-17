import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)) throw new Error("Unsafe QA schema");
const url = new URL(fixture.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected disposable Roster PostgreSQL schema");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [availabilityRows, importAudits, shiftCount, publicationCount, shortcuts] = await Promise.all([
    db.employeeAvailability.count({ where: { storeId: "browser-store" } }),
    db.availabilityScriptImport.count({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "browser-store" } }),
  ]);
  if (availabilityRows !== 0 || importAudits !== 0 || shiftCount !== 3 || publicationCount !== 1
    || shortcuts?.version !== 2 || shortcuts.shortcuts[0]?.code !== "AA"
    || shortcuts.shortcuts[0]?.startTime !== "11:00" || shortcuts.shortcuts[0]?.endTime !== "22:00") {
    throw new Error("Script tabs changed unexpected Roster data");
  }
  console.log(JSON.stringify({ availabilityRows, importAudits, shiftCount, publicationCount,
    shortcutsVersion: shortcuts.version, firstShortcut: shortcuts.shortcuts[0] }));
} finally { await db.$disconnect(); }
