import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe QA schema");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const original = await db.shift.findUniqueOrThrow({ where: { id: "qa-published-shift" }, include: { assignments: true } });
  const publication = await db.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: "qa-published-period" } });
  const snapshot = publication.snapshot;
  if (original.storeId !== "browser-store" || original.rosterPeriodId !== "qa-published-period"
    || original.roleNameSnapshot !== "QA Front" || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
    || !Array.isArray(snapshot.shifts) || snapshot.shifts.length !== 1
    || await db.shift.count({ where: { rosterPeriodId: "qa-published-period" } }) !== 1) throw new Error("Unexpected published QA baseline");
  const extra = await db.shift.create({ data: { id: "qa-published-historical-role", storeId: "browser-store",
    rosterPeriodId: "qa-published-period", date: original.date, startAt: original.startAt, endAt: original.endAt,
    breakMinutes: original.breakMinutes, shiftRoleId: original.shiftRoleId,
    roleNameSnapshot: "QA Historical", roleColorSnapshot: "#a855f7",
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: "browser-training", employeeNameSnapshot: "Training Alice", employeeTypeSnapshot: "TRAINING" } },
  }, include: { assignments: true } });
  const extraSnapshot = { id: extra.id, rosterPeriodId: extra.rosterPeriodId, storeId: extra.storeId,
    date: "2026-10-16", startAt: extra.startAt.toISOString(), endAt: extra.endAt.toISOString(), breakMinutes: extra.breakMinutes,
    shiftRoleId: extra.shiftRoleId, roleNameSnapshot: extra.roleNameSnapshot, roleColorSnapshot: extra.roleColorSnapshot,
    publicNote: null, assignments: extra.assignments.map((row) => ({ id: row.id, employeeId: row.employeeId,
      employeeNameSnapshot: row.employeeNameSnapshot, employeeTypeSnapshot: row.employeeTypeSnapshot,
      employmentTypeSnapshot: row.employmentTypeSnapshot, officialScoreSnapshot: null, tierSnapshot: null })) };
  await db.rosterPublication.update({ where: { id: publication.id }, data: { snapshot: { ...snapshot, shifts: [...snapshot.shifts, extraSnapshot] } } });
  console.log(JSON.stringify({ seeded: true, publishedShifts: 2, snapshotShifts: 2 }));
} finally {
  await db.$disconnect();
}
