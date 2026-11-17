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
  const [target, source, published, shifts, periods, publications, availability] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-copy-conflict-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ where: { date: new Date("2026-10-23") }, include: { assignments: true } }),
    db.rosterPeriod.count(), db.rosterPublication.count(), db.employeeAvailability.count(),
  ]);
  const original = shifts.find((shift) => shift.id === "qa-copy-conflict-shift");
  const copied = shifts.find((shift) => shift.id !== "qa-copy-conflict-shift");
  if (target.version !== 2 || source.version !== 1 || published.version !== 1 || periods !== 3 ||
    shifts.length !== 2 || original?.version !== 1 || original.assignments[0]?.employeeId !== "browser-regular" ||
    copied?.version !== 1 || copied.assignments.length !== 1 || copied.assignments[0]?.employeeId !== "browser-HandoverEmployee006" ||
    copied.startAt.toISOString() !== "2026-10-22T22:00:00.000Z" || copied.endAt.toISOString() !== "2026-10-23T02:00:00.000Z" ||
    publications !== 1 || availability !== 2) throw new Error("Copy Shift conflict fixture changed unexpectedly");
  console.log(JSON.stringify({ verified: true, copiedId: copied.id, sourceVersion: source.version,
    targetVersion: target.version, publishedVersion: published.version, targetShifts: shifts.length, publications }));
} finally { await db.$disconnect(); }
