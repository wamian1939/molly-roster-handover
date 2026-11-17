import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe QA schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe QA URL");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [availabilityRows, importAudits, shortcuts] = await Promise.all([
    db.employeeAvailability.count({ where: { storeId: "browser-store", source: "SCRIPT" } }),
    db.availabilityScriptImport.count({ where: { storeId: "browser-store" } }),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "browser-store" } }),
  ]);
  if (availabilityRows !== 0 || importAudits !== 0 || shortcuts?.version !== 1) {
    throw new Error("Preview or clear wrote Availability, or shortcut setup was not saved");
  }
  console.log(JSON.stringify({ availabilityRows, importAudits, shortcutVersion: shortcuts.version }));
} finally { await db.$disconnect(); }
