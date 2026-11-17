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
  const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-26"), source: "SCRIPT" } });
  const audits = await db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } });
  if (rows.length !== 1 || rows[0]?.employeeId !== "browser-HandoverEmployee006"
    || rows[0].startAt?.toISOString() !== "2026-10-25T23:00:00.000Z"
    || rows[0].endAt?.toISOString() !== "2026-10-26T11:00:00.000Z"
    || audits.length !== 1 || audits[0]?.createdCount !== 1) throw new Error("Alias import did not persist as one canonical employee row");
  console.log(JSON.stringify({ canonicalEmployeeId: rows[0].employeeId, rows: rows.length, audits: audits.length }));
} finally { await db.$disconnect(); }
