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
  const [draft, published, shifts, publications] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ include: { assignments: true }, orderBy: { id: "asc" } }),
    db.rosterPublication.count(),
  ]);
  const copied = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === "2026-10-10");
  if (draft.version !== 2 || published.version !== 1 || shifts.length !== 4 || copied.length !== 1 ||
    copied[0]?.assignments.length !== 1 || copied[0].assignments[0]?.employeeId !== "browser-HandoverEmployee006" ||
    copied[0].startAt.toISOString() !== "2026-10-09T22:00:00.000Z" ||
    copied[0].endAt.toISOString() !== "2026-10-10T02:00:00.000Z" ||
    publications !== 1) throw new Error("Copy Shift target state differs from browser result");
  console.log(JSON.stringify({ verified: true, copiedId: copied[0].id, employeeId: copied[0].assignments[0]!.employeeId,
    draftVersion: draft.version, publishedVersion: published.version, shifts: shifts.length, publications }));
} finally { await db.$disconnect(); }
