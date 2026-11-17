import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const rosterRequire = createRequire(join(workspace, "backend", "package.json"));
const evaluateRequire = createRequire(resolve(workspace, "..", "Evaluate Molly", "backend", "package.json"));
const { PrismaClient: RosterPrisma } = rosterRequire("@prisma/client");
const { PrismaClient: EvaluatePrisma } = evaluateRequire("@prisma/client");
const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
function assertDisposable(state, pattern, port, database) {
  const url = new URL(state.isolatedUrl);
  if (!pattern.test(state.schema) || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== port
    || url.pathname !== database || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable fixture");
}
assertDisposable(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "5433", "/molly_roster");
assertDisposable(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "5432", "/evaluate_molly");
const roster = new RosterPrisma({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrisma({ datasourceUrl: evaluateState.isolatedUrl });
try {
  if (await roster.employeeAvailability.count({ where: { storeId: "browser-store" } })
    || await evaluate.storeJobDefinition.count({ where: { storeId: "browser-store" } })
    || await evaluate.employeeJobAssignment.count({ where: { storeId: "browser-store" } })) throw new Error("Unexpected nonempty QA fixture");
  const job = await evaluate.storeJobDefinition.create({ data: { storeId: "browser-store", name: "QA Front", code: "qa-front", colorToken: "blue", displayOrder: 1 } });
  await evaluate.employeeJobAssignment.create({ data: { employeeId: "browser-regular", jobId: job.id, storeId: "browser-store" } });
  await roster.employeeAvailability.createMany({ data: ["browser-regular", "browser-training"].map((employeeId) => ({
    storeId: "browser-store", employeeId, date: new Date("2026-10-10"), status: "AVAILABLE",
    startAt: new Date("2026-10-09T13:00:00.000Z"), endAt: new Date("2026-10-10T12:59:00.000Z"),
  })) });
  console.log(JSON.stringify({ seeded: true, formalJobId: job.id, confirmedEmployee: "browser-regular", unconfirmedEmployee: "browser-training" }));
} finally {
  await roster.$disconnect();
  await evaluate.$disconnect();
}
