import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
if (command !== "rename" && command !== "verify") throw new Error("Expected rename or verify");
const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
function assertQaUrl(state, pattern, database, port) {
  const url = new URL(state.isolatedUrl);
  if (!pattern.test(state.schema) || !["localhost", "127.0.0.1"].includes(url.hostname)
    || url.port !== port || url.pathname !== `/${database}` || url.searchParams.get("schema") !== state.schema) {
    throw new Error("Unsafe QA schema");
  }
}
assertQaUrl(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "molly_roster", "5433");
assertQaUrl(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "evaluate_molly", "5432");

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const fromEvaluate = createRequire(resolve(workspace, "..", "Evaluate Molly", "backend", "package.json"));
const fromRoster = createRequire(join(workspace, "backend", "package.json"));
const evaluate = new (fromEvaluate("@prisma/client").PrismaClient)({ datasourceUrl: evaluateState.isolatedUrl });
const roster = new (fromRoster("@prisma/client").PrismaClient)({ datasourceUrl: rosterState.isolatedUrl });
try {
  const employee = await evaluate.employee.findUniqueOrThrow({ where: { id: "browser-regular" } });
  const publishedShift = await roster.shift.findUniqueOrThrow({ where: { id: "qa-published-shift" }, include: { assignments: true } });
  const publication = await roster.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: "qa-published-period" } });
  const snapshot = publication.snapshot;
  const snapshotShift = snapshot?.shifts?.find((shift) => shift.id === "qa-published-shift");
  if (employee.storeId !== "browser-store" || publishedShift.storeId !== "browser-store"
    || publishedShift.assignments.length !== 1 || publishedShift.assignments[0].employeeId !== employee.id
    || publishedShift.assignments[0].employeeNameSnapshot !== "Regular Bob"
    || snapshotShift?.assignments?.[0]?.employeeNameSnapshot !== "Regular Bob") throw new Error("Unexpected QA baseline");
  if (command === "rename") {
    if (employee.displayName !== "Regular Bob") throw new Error("Employee already changed");
    await evaluate.employee.update({ where: { id: employee.id }, data: { displayName: "Renamed Bob" } });
  } else if (employee.displayName !== "Renamed Bob") throw new Error("Evaluate rename missing");
  console.log(JSON.stringify({ verified: true, currentName: command === "rename" ? "Renamed Bob" : employee.displayName,
    publishedAssignmentName: publishedShift.assignments[0].employeeNameSnapshot,
    publicationSnapshotName: snapshotShift.assignments[0].employeeNameSnapshot,
    publicationCount: await roster.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    publishedShiftVersion: publishedShift.version }));
} finally {
  await Promise.all([evaluate.$disconnect(), roster.$disconnect()]);
}
