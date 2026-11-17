import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe QA schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the paired disposable Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [roles, shifts, publications, periods] = await Promise.all([
    db.shiftRole.findMany({ select: { id: true, code: true, nameZh: true, storeId: true }, orderBy: { code: "asc" } }),
    db.shift.findMany({ select: { id: true, shiftRoleId: true, version: true, rosterPeriodId: true }, orderBy: { id: "asc" } }),
    db.rosterPublication.findMany({ select: { id: true, periodVersion: true, snapshot: true } }),
    db.rosterPeriod.findMany({ select: { id: true, status: true, version: true }, orderBy: { id: "asc" } }),
  ]);
  const legacy = roles.find((role) => role.code === "qa-front" && role.nameZh === "QA Front" && role.storeId === null);
  const formal = roles.find((role) => role.code === "official-front" && role.nameZh === "QA Front" && role.storeId === "browser-store");
  if (!legacy || !formal || roles.length !== 2) throw new Error("Expected distinct legacy and formal roles");
  if (shifts.length !== 3 || !["qa-draft-shift", "qa-draft-grouped-shift", "qa-published-shift"]
    .every((id) => shifts.some((shift) => shift.id === id && shift.shiftRoleId === legacy.id && shift.version === 1))) {
    throw new Error("A historical Shift changed role or version");
  }
  if (publications.length !== 1 || publications[0]!.periodVersion !== 1
    || JSON.stringify(publications[0]!.snapshot).includes("official-front")) {
    throw new Error("Published history changed");
  }
  if (periods.length !== 2 || periods.some((period) => period.version !== 1)) throw new Error("A period changed");
  console.log(JSON.stringify({ result: "PASS", roles: roles.map(({ code, storeId }) => ({ code, storeId })),
    shifts: shifts.length, publications: publications.length, periodVersions: periods.map(({ id, version }) => ({ id, version })) }));
} finally {
  await db.$disconnect();
}
