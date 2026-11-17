import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
try {
  const employee = await evaluate.employee.findUniqueOrThrow({ where: { id: "browser-regular" } });
  if (employee.storeId !== "browser-store") throw new Error("Fixture employee was already moved");
  const draftShift = await roster.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } });
  if (draftShift.storeId !== "browser-store" || !draftShift.assignments.some((assignment) => assignment.employeeId === employee.id)) throw new Error("Unexpected draft fixture");
  if (await roster.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-09") } })) throw new Error("Target Availability already exists");
  await roster.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-09"), status: "AVAILABLE", startAt: draftShift.startAt, endAt: draftShift.endAt } });
  await evaluate.employee.update({ where: { id: employee.id }, data: { storeId: "browser-other-store" } });
  console.log(JSON.stringify({ movedEmployeeId: employee.id, destinationStore: "browser-other-store", targetAvailableEmployeeId: "browser-HandoverEmployee006", draftShiftId: draftShift.id }));
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
