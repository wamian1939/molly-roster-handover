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
const command = process.argv[2];
if (command !== "prepare" && command !== "transfer") throw new Error("Expected prepare or transfer");

const roster = new RosterPrismaClient({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrismaClient({ datasourceUrl: evaluateState.isolatedUrl });
try {
  const [employee, original, grouped] = await Promise.all([
    evaluate.employee.findUniqueOrThrow({ where: { id: "browser-regular" } }),
    roster.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    roster.shift.findUniqueOrThrow({ where: { id: "qa-draft-grouped-shift" } }),
  ]);
  if (original.version !== 1 || original.storeId !== "browser-store" || original.assignments.length !== 1 || original.assignments[0].employeeId !== employee.id) {
    throw new Error("Unexpected original Shift fixture");
  }
  if (command === "prepare") {
    if (employee.storeId !== "browser-other-store" || grouped.startAt.toISOString() !== original.startAt.toISOString()) throw new Error("Unexpected transfer or grouped Shift state");
    await roster.shift.update({ where: { id: grouped.id }, data: { startAt: new Date("2026-10-09T06:00:00.000Z"), endAt: new Date("2026-10-09T08:00:00.000Z") } });
    await evaluate.employee.update({ where: { id: employee.id }, data: { storeId: "browser-store" } });
  } else {
    if (employee.storeId !== "browser-store" || grouped.startAt.toISOString() !== "2026-10-09T06:00:00.000Z") throw new Error("TimeGrid fixture not prepared");
    await evaluate.employee.update({ where: { id: employee.id }, data: { storeId: "browser-other-store" } });
  }
  console.log(JSON.stringify({ command, employeeId: employee.id, storeId: command === "prepare" ? "browser-store" : "browser-other-store" }));
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
