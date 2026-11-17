// Give the disposable published-shift employee the exact formal QA position.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const evaluateRequire = createRequire(join(dirname(workspace), "Evaluate Molly", "backend", "package.json"));
const { PrismaClient } = evaluateRequire("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5432"
  || url.pathname !== "/evaluate_molly" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable Evaluate schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  await db.$transaction(async (tx) => {
    const [employee, existingJobs, existingAssignments] = await Promise.all([
      tx.employee.findUnique({ where: { id: "browser-regular" } }),
      tx.storeJobDefinition.count({ where: { storeId: "browser-store" } }),
      tx.employeeJobAssignment.count({ where: { employeeId: "browser-regular" } }),
    ]);
    if (!employee || employee.storeId !== "browser-store" || employee.status !== "Active"
      || existingJobs || existingAssignments) throw new Error("Disposable workforce baseline differs");
    const job = await tx.storeJobDefinition.create({ data: {
      id: "browser-publication-qa-front", storeId: "browser-store", code: "qa-front",
      name: "QA Front", colorToken: "#2563eb", displayOrder: 1,
    } });
    await tx.employeeJobAssignment.create({ data: {
      employeeId: employee.id, jobId: job.id, storeId: "browser-store", assignedByAccountId: "browser-admin",
    } });
  });
  console.log(JSON.stringify({ seeded: true, formalJob: "browser-publication-qa-front", employeeId: "browser-regular" }));
} finally {
  await db.$disconnect();
}
