import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)) throw new Error("Expected disposable Evaluate schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5432"
  || url.pathname !== "/evaluate_molly" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the isolated local Evaluate database");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  await db.$transaction(async (transaction) => {
    const [store, employees, existingJob] = await Promise.all([
      transaction.store.findUnique({ where: { id: "browser-store" } }),
      transaction.employee.findMany({ where: { id: { in: ["browser-HandoverEmployee006", "browser-cindy"] }, storeId: "browser-store", status: "Active" }, select: { id: true } }),
      transaction.storeJobDefinition.findFirst({ where: { storeId: "browser-store", code: "qa-front" } }),
    ]);
    if (!store || employees.length !== 2 || existingJob) throw new Error("Disposable workforce baseline differs");
    const job = await transaction.storeJobDefinition.create({ data: {
      id: "browser-qa-front-job", storeId: "browser-store", code: "qa-front", name: "QA Front",
      colorToken: "#2563eb", displayOrder: 1,
    } });
    await transaction.employeeJobAssignment.createMany({ data: employees.map(({ id }) => ({
      employeeId: id, jobId: job.id, storeId: "browser-store", assignedByAccountId: "browser-admin",
    })) });
  });
  console.log(JSON.stringify({ schema: state.schema, formalJob: "browser-qa-front-job",
    qualifiedEmployees: ["browser-HandoverEmployee006", "browser-cindy"] }));
} finally {
  await db.$disconnect();
}
