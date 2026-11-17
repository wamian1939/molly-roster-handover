import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const sibling = dirname(workspace);
const evaluateRequire = createRequire(join(sibling, "Evaluate Molly", "backend", "package.json"));
const { PrismaClient } = evaluateRequire("@prisma/client");
const mode = process.argv[2] ?? "seed";
if (!["seed", "verify"].includes(mode)) throw new Error("Expected seed or verify");
const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5432" ||
  url.pathname !== "/evaluate_molly" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Evaluate schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (mode === "verify") {
    const [job, assignments, bobAssignments] = await Promise.all([
      db.storeJobDefinition.findUniqueOrThrow({ where: { id: "qa-water-position" } }),
      db.employeeJobAssignment.findMany({ where: { jobId: "qa-water-position" } }),
      db.employeeJobAssignment.count({ where: { employeeId: "browser-regular" } }),
    ]);
    if (job.storeId !== "browser-store" || job.name !== "QA Water" || assignments.length !== 1 ||
      assignments[0].employeeId !== "browser-HandoverEmployee006" || bobAssignments !== 0) {
      throw new Error("Evaluate formal-position fixture changed unexpectedly");
    }
    console.log(JSON.stringify({ verified: true, source: "Evaluate", positionId: job.id,
      employeeId: assignments[0].employeeId, bobAssignments }));
  } else {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: "browser-HandoverEmployee006" } });
  if (employee.storeId !== "browser-store" || await db.employeeJobAssignment.count({ where: { employeeId: employee.id } }) ||
    await db.storeJobDefinition.count({ where: { id: "qa-water-position" } })) {
    throw new Error("Unexpected formal-position fixture baseline");
  }
  await db.storeJobDefinition.create({ data: { id: "qa-water-position", storeId: "browser-store", name: "QA Water", code: "QA_WATER", colorToken: "teal",
    assignments: { create: { employeeId: employee.id } } } });
  console.log(JSON.stringify({ seeded: true, positionId: "qa-water-position", employeeId: employee.id, source: "Evaluate" }));
  }
} finally {
  await db.$disconnect();
}
