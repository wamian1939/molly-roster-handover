import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const evaluateBackend = join(dirname(workspace), "Evaluate Molly", "backend");
const evaluateRequire = createRequire(join(evaluateBackend, "package.json"));
evaluateRequire("dotenv").config({ path: join(evaluateBackend, ".env") });
const { PrismaClient } = evaluateRequire("@prisma/client");
const db = new PrismaClient();
try {
  const jobs = await db.storeJobDefinition.findMany({
    where: { storeId: "hurstville" },
    select: { name: true, code: true, isActive: true, _count: { select: { assignments: true } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  console.log(JSON.stringify(jobs.map((job) => ({ name: job.name, code: job.code,
    active: job.isActive, assignedEmployees: job._count.assignments })), null, 2));
} finally {
  await db.$disconnect();
}
