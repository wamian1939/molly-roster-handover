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
  const [shifts, period, publications] = await Promise.all([
    db.shift.findMany({ where: { rosterPeriodId: "qa-published-period" }, select: { id: true, shiftRoleId: true,
      roleNameSnapshot: true, roleColorSnapshot: true, startAt: true, endAt: true, version: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.findMany({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  if (shifts.length !== 2 || publications.length !== 1 || period.status !== "PUBLISHED" || period.version !== 1
    || shifts.some((shift) => shift.version !== 1 || shift.shiftRoleId !== shifts[0].shiftRoleId
      || shift.startAt.getTime() !== shifts[0].startAt.getTime() || shift.endAt.getTime() !== shifts[0].endAt.getTime())) {
    throw new Error("Published Roster changed during display QA");
  }
  const expected = new Map([["QA Front", "#2563eb"], ["QA Historical", "#a855f7"]]);
  if (shifts.some((shift) => expected.get(shift.roleNameSnapshot) !== shift.roleColorSnapshot)) throw new Error("Shift role snapshots changed");
  const snapshot = publications[0].snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(snapshot.shifts)
    || snapshot.shifts.length !== 2 || snapshot.shifts.some((shift) => !shift || typeof shift !== "object"
      || Array.isArray(shift) || expected.get(shift.roleNameSnapshot) !== shift.roleColorSnapshot)) {
    throw new Error("Publication role snapshots changed");
  }
  console.log(JSON.stringify({ verified: true, publishedShifts: shifts.length, publicationShifts: snapshot.shifts.length,
    periodVersion: period.version, publications: publications.length }));
} finally {
  await db.$disconnect();
}
