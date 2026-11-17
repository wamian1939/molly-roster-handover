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
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe QA database URL");
const stage = process.argv[2];
if (stage !== "before" && stage !== "after") throw new Error("Expected before or after");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
    date: { gte: new Date("2026-10-26"), lte: new Date("2026-10-27") } }, orderBy: { date: "asc" } });
  const audits = await db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } });
  if (stage === "before" && (rows.length || audits.length)) throw new Error("Cancel/preview wrote to QA database");
  if (stage === "after" && (rows.length !== 2 || audits.length !== 1
    || rows[0]?.date.toISOString().slice(0, 10) !== "2026-10-26"
    || rows[0]?.startAt?.toISOString() !== "2026-10-25T23:00:00.000Z"
    || rows[0]?.endAt?.toISOString() !== "2026-10-26T11:00:00.000Z"
    || rows[1]?.date.toISOString().slice(0, 10) !== "2026-10-27"
    || rows[1]?.startAt?.toISOString() !== "2026-10-26T23:00:00.000Z"
    || rows[1]?.endAt?.toISOString() !== "2026-10-27T06:00:00.000Z"
    || rows.some((row) => row.source !== "SCRIPT") || audits[0]?.createdCount !== 2)) {
    throw new Error("Unexpected QA import rows or audit");
  }
  console.log(JSON.stringify({ stage, rows: rows.length, auditRows: audits.length,
    sources: [...new Set(rows.map((row) => row.source))] }));
} finally { await db.$disconnect(); }
