import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const sibling = dirname(workspace);
const rosterRequire = createRequire(join(workspace, "backend", "package.json"));
const evaluateRequire = createRequire(join(sibling, "Evaluate Molly", ".deployment-local", "release-candidate", "backend", "package.json"));
const rootRequire = createRequire(join(workspace, "package.json"));
const { PrismaClient: RosterPrismaClient } = rosterRequire("@prisma/client");
const { PrismaClient: EvaluatePrismaClient } = evaluateRequire("@prisma/client");
const { DateTime } = rootRequire("luxon");
const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
assertFixture(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "molly_roster", "5433");
assertFixture(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "evaluate_molly", "5432");

const roster = new RosterPrismaClient({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrismaClient({ datasourceUrl: evaluateState.isolatedUrl });
const fixtureIds = ["browser-training", "browser-regular", "browser-HandoverEmployee006", "browser-cindy", "browser-HandoverEmployee019", "browser-evan", "browser-fiona", "browser-grace", "browser-henry", "browser-ivy"];
const periodId = "valid-calendar-period";
const employeeCount = 500;

try {
  if (await roster.rosterPeriod.count({ where: { id: periodId } })) throw new Error("Valid browser fixture already exists");
  if (await evaluate.employee.count({ where: { id: { startsWith: "valid-calendar-employee-" } } })) throw new Error("Valid browser workforce already exists");
  const existingEmployees = await evaluate.employee.findMany({ where: { id: { in: fixtureIds }, storeId: "browser-store" }, select: { id: true, displayName: true, employeeType: true, employmentType: true } });
  if (existingEmployees.length !== fixtureIds.length) throw new Error("Expected all canonical fixture employees");
  const existingById = new Map(existingEmployees.map((employee) => [employee.id, employee]));
  const role = await roster.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
  const employees = Array.from({ length: employeeCount - fixtureIds.length }, (_, index) => ({
    id: `valid-calendar-employee-${String(index + fixtureIds.length).padStart(4, "0")}`,
    storeId: "browser-store",
    displayName: `Valid Employee ${String(index + fixtureIds.length).padStart(4, "0")}`,
    employmentType: "FullTime",
  }));
  await evaluate.employee.createMany({ data: employees });
  await roster.rosterPeriod.create({ data: { id: periodId, storeId: "browser-store", startDate: new Date("2026-10-19"), endDate: new Date("2026-10-25"), cycleType: "WEEK", createdByAccountId: "qa-admin" } });
  const availabilities = [];
  const shifts = [];
  const assignments = [];
  for (let day = 0; day < 5; day += 1) {
    const date = DateTime.fromISO("2026-10-19", { zone: "Australia/Sydney" }).plus({ days: day }).toISODate();
    const at = (time) => DateTime.fromISO(`${date}T${time}`, { zone: "Australia/Sydney" }).toUTC().toJSDate();
    for (let employeeIndex = 0; employeeIndex < employeeCount; employeeIndex += 1) {
      const employeeId = fixtureIds[employeeIndex] ?? `valid-calendar-employee-${String(employeeIndex).padStart(4, "0")}`;
      const existing = existingById.get(employeeId);
      const employeeName = existing?.displayName ?? `Valid Employee ${String(employeeIndex).padStart(4, "0")}`;
      availabilities.push({ storeId: "browser-store", employeeId, date: new Date(`${date}T00:00:00.000Z`), status: "AVAILABLE", startAt: at("09:00"), endAt: at("17:00") });
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const id = `valid-calendar-shift-${day}-${employeeIndex}-${sequence}`;
        shifts.push({ id, rosterPeriodId: periodId, storeId: "browser-store", date: new Date(`${date}T00:00:00.000Z`), startAt: at(sequence ? "14:00" : "09:00"), endAt: at(sequence ? "17:00" : "12:00"), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin" });
        assignments.push({ shiftId: id, employeeId, employeeNameSnapshot: employeeName, employeeTypeSnapshot: existing?.employeeType ?? "REGULAR", employmentTypeSnapshot: existing?.employmentType ?? "FullTime" });
      }
    }
  }
  await roster.$transaction(async (transaction) => {
    for (let offset = 0; offset < availabilities.length; offset += 500) await transaction.employeeAvailability.createMany({ data: availabilities.slice(offset, offset + 500) });
    for (let offset = 0; offset < shifts.length; offset += 500) await transaction.shift.createMany({ data: shifts.slice(offset, offset + 500) });
    for (let offset = 0; offset < assignments.length; offset += 500) await transaction.shiftAssignment.createMany({ data: assignments.slice(offset, offset + 500) });
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ employees: employeeCount, newEvaluateEmployees: employees.length, shifts: shifts.length, availability: availabilities.length, periodId }));
} finally {
  await Promise.all([roster.$disconnect(), evaluate.$disconnect()]);
}

function assertFixture(state, pattern, database, port) {
  if (!pattern.test(state.schema)) throw new Error("Unexpected fixture schema");
  const url = new URL(state.isolatedUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== port || url.pathname !== `/${database}` || url.searchParams.get("schema") !== state.schema) {
    throw new Error("Fixture must use an isolated local database schema");
  }
}
