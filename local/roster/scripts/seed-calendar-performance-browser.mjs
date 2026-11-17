import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = Number(process.argv[2]);
if (![50, 100, 500].includes(target)) throw new Error("Expected 50, 100, or 500");

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const sibling = dirname(workspace);
const rosterRequire = createRequire(join(workspace, "backend", "package.json"));
const evaluateRequire = createRequire(join(sibling, "Evaluate Molly", ".deployment-local", "release-candidate", "backend", "package.json"));
const { PrismaClient: RosterPrismaClient } = rosterRequire("@prisma/client");
const { PrismaClient: EvaluatePrismaClient } = evaluateRequire("@prisma/client");

const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
assertFixture(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "molly_roster", "5433");
assertFixture(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "evaluate_molly", "5432");

const roster = new RosterPrismaClient({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrismaClient({ datasourceUrl: evaluateState.isolatedUrl });
const fixtureIds = [
  "browser-training", "browser-regular", "browser-HandoverEmployee006", "browser-cindy", "browser-HandoverEmployee019",
  "browser-evan", "browser-fiona", "browser-grace", "browser-henry", "browser-ivy",
];

try {
  const existingShifts = await roster.shift.count({ where: { id: { startsWith: "bench-shift-" } } });
  if (existingShifts % 10 !== 0) throw new Error("Incomplete benchmark fixture");
  const current = existingShifts / 10;
  if (current >= target || ![0, 50, 100].includes(current)) throw new Error("Unexpected benchmark stage");
  const existingEmployees = await evaluate.employee.count({ where: { id: { startsWith: "bench-employee-" } } });
  if (existingEmployees !== Math.max(0, current - fixtureIds.length)) throw new Error("Benchmark workforce does not match shifts");
  const roleRows = Array.from({ length: 6 }, (_, index) => ({
    id: `bench-role-${index}`,
    storeId: "browser-store",
    code: `bench-role-${index}`,
    nameZh: `Benchmark ${index}`,
    colorToken: "#647180",
    displayOrder: 100 + index,
  }));
  await roster.shiftRole.createMany({ data: roleRows, skipDuplicates: true });

  const newEmployees = [];
  for (let index = Math.max(current, fixtureIds.length); index < target; index += 1) {
    newEmployees.push({
      id: `bench-employee-${String(index).padStart(4, "0")}`,
      storeId: "browser-store",
      displayName: `Benchmark ${String(index).padStart(4, "0")}`,
      employmentType: "FullTime",
    });
  }
  if (newEmployees.length) await evaluate.employee.createMany({ data: newEmployees });

  const shifts = [];
  const assignments = [];
  for (let employee = current; employee < target; employee += 1) {
    const employeeId = fixtureIds[employee] ?? `bench-employee-${String(employee).padStart(4, "0")}`;
    for (let day = 0; day < 5; day += 1) {
      const dateMs = Date.parse("2026-10-05T00:00:00.000Z") + day * 86_400_000;
      const date = new Date(dateMs);
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const key = employee * 2 + sequence;
        const startSlot = key % 20;
        const durationSlots = 2 + Math.floor(key / 20) % 6;
        const roleIndex = Math.floor(key / 120) % 6;
        const breakMinutes = Math.floor(key / 720) % 3 * 15;
        const startAt = new Date(dateMs - 2 * 3_600_000 + startSlot * 30 * 60_000);
        const endAt = new Date(startAt.getTime() + durationSlots * 30 * 60_000);
        const id = `bench-shift-${employee}-${day}-${sequence}`;
        shifts.push({
          id,
          rosterPeriodId: "qa-draft-period",
          storeId: "browser-store",
          date,
          startAt,
          endAt,
          breakMinutes,
          shiftRoleId: `bench-role-${roleIndex}`,
          roleNameSnapshot: `Benchmark ${roleIndex}`,
          roleColorSnapshot: "#647180",
          createdByAccountId: "qa-admin",
          updatedByAccountId: "qa-admin",
        });
        assignments.push({
          shiftId: id,
          employeeId,
          employeeNameSnapshot: employee < fixtureIds.length ? employeeId : `Benchmark ${String(employee).padStart(4, "0")}`,
          employeeTypeSnapshot: "REGULAR",
          employmentTypeSnapshot: "FullTime",
        });
      }
    }
  }
  await roster.$transaction(async (transaction) => {
    for (let offset = 0; offset < shifts.length; offset += 500) {
      await transaction.shift.createMany({ data: shifts.slice(offset, offset + 500) });
    }
    for (let offset = 0; offset < assignments.length; offset += 500) {
      await transaction.shiftAssignment.createMany({ data: assignments.slice(offset, offset + 500) });
    }
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ targetEmployees: target, newEmployees: newEmployees.length, newShifts: shifts.length, newAssignments: assignments.length }));
} finally {
  await Promise.all([roster.$disconnect(), evaluate.$disconnect()]);
}

function assertFixture(state, pattern, database, port) {
  if (!pattern.test(state.schema)) throw new Error("Unexpected fixture schema");
  const url = new URL(state.isolatedUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)
    || url.port !== port || url.pathname !== `/${database}`
    || url.searchParams.get("schema") !== state.schema) {
    throw new Error("Fixture must use an isolated local database schema");
  }
}
