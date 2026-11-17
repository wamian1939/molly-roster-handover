import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)) throw new Error("Unsafe fixture schema");
const url = new URL(fixture.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433" ||
    url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Unsafe fixture database URL");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, imports, shifts, publications, shortcuts] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-26") },
      select: { employeeId: true, source: true, status: true, startAt: true, endAt: true, version: true } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" },
      select: { createdCount: true, unchangedCount: true, mode: true } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "browser-store" }, select: { version: true } }),
  ]);
  const ids = rows.map((row) => row.employeeId).sort();
  if (JSON.stringify(ids) !== JSON.stringify(["browser-HandoverEmployee006", "browser-cindy"]) ||
      rows.some((row) => row.source !== "SCRIPT" || row.status !== "AVAILABLE" || row.version !== 1 ||
        row.startAt?.toISOString() !== "2026-10-25T23:00:00.000Z" ||
        row.endAt?.toISOString() !== "2026-10-26T11:00:00.000Z") ||
      imports.length !== 2 || imports.some((row) => row.createdCount !== 1 || row.unchangedCount !== 0 || row.mode !== "APPEND") ||
      shifts !== 3 || publications !== 1 || shortcuts?.version !== 1) {
    throw new Error("Scoped script QA database state differs from the expected fixture");
  }
  console.log(JSON.stringify({ canonicalEmployeeIds: ids, availabilityRows: rows.length,
    importAudits: imports.length, shifts, publications, shortcutVersion: shortcuts.version }));
} finally {
  await db.$disconnect();
}
