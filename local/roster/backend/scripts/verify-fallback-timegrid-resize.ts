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
  const moved = process.argv.includes("--moved");
  const expectedStart = moved ? "2026-04-04T15:30:00.000Z" : "2026-04-04T15:00:00.000Z";
  const expectedEnd = moved ? "2026-04-04T17:30:00.000Z" : "2026-04-04T17:00:00.000Z";
  const expectedVersion = moved ? 4 : 3;
  const [shift, fallback, draft, published, shiftCount, publications] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: "qa-fallback-copy-source" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.count(), db.rosterPublication.count(),
  ]);
  if (shift.startAt.toISOString() !== expectedStart || shift.endAt.toISOString() !== expectedEnd ||
    shift.version !== expectedVersion || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006" ||
    fallback.version !== expectedVersion || draft.version !== 1 || published.version !== 1 || shiftCount !== 4 || publications !== 1) {
    throw new Error("Fall-back resize did not preserve exact instants and unrelated history");
  }
  console.log(JSON.stringify({ verified: true, moved, startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(),
    shiftVersion: shift.version, fallbackPeriodVersion: fallback.version, draftVersion: draft.version,
    publishedVersion: published.version, shifts: shiftCount, publications }));
} finally { await db.$disconnect(); }
