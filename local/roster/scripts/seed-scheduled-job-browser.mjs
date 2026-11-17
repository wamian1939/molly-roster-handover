import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const evaluateBackend = resolve(workspace, "..", "Evaluate Molly", "backend");
const requireEvaluate = createRequire(join(evaluateBackend, "package.json"));
const { PrismaClient } = requireEvaluate("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5432"
  || url.pathname !== "/evaluate_molly" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Evaluate schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  await db.$transaction(async (tx) => {
    const [store, employees, existingJobs] = await Promise.all([
      tx.store.findUnique({ where: { id: "browser-store" } }),
      tx.employee.findMany({ where: { id: { in: ["browser-regular", "browser-training", "browser-HandoverEmployee006"] }, storeId: "browser-store", status: "Active" }, select: { id: true } }),
      tx.storeJobDefinition.count({ where: { storeId: "browser-store" } }),
    ]);
    if (!store || employees.length !== 3 || existingJobs) throw new Error("Unexpected disposable workforce baseline");
    const specs = [
      { employeeId: "browser-regular", id: "browser-qa-service-job", code: "qa-service", name: "QA Service", displayOrder: 1 },
      { employeeId: "browser-training", id: "browser-qa-training-job", code: "qa-training", name: "QA Training", displayOrder: 2 },
      { employeeId: "browser-HandoverEmployee006", id: "browser-qa-unused-job", code: "qa-unused", name: "QA Unused", displayOrder: 3 },
    ];
    for (const spec of specs) {
      await tx.storeJobDefinition.create({ data: {
        id: spec.id, storeId: "browser-store", code: spec.code, name: spec.name,
        colorToken: "#2563eb", displayOrder: spec.displayOrder,
      } });
      await tx.employeeJobAssignment.create({ data: {
        employeeId: spec.employeeId, jobId: spec.id, storeId: "browser-store", assignedByAccountId: "browser-admin",
      } });
    }
  });
  console.log(JSON.stringify({ schema: state.schema, jobs: ["QA Service", "QA Training", "QA Unused"], isolated: true }));
} finally {
  await db.$disconnect();
}
