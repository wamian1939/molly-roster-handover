import { performance } from "node:perf_hooks";
import { Prisma } from "@prisma/client";
import { AnalyticsV1Service } from "../src/analyticsV1Service.js";
import type { AuthContext } from "../src/auth.js";
import { EvaluationReadService } from "../src/evaluationReadService.js";
import { prisma } from "../src/prisma.js";
import { RosterSkillBoardService } from "../src/rosterSkillBoardService.js";

const sizes = [25, 100, 500] as const;
const prefix = "audit-perf-";
const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>(Prisma.sql`SELECT current_schema() AS schema`);
if (!/^codex_browser_acceptance_[0-9]+$/.test(schema)) {
  throw new Error("Population benchmark is restricted to the isolated browser-acceptance schema.");
}

const actor: AuthContext = { id: "audit", accountId: "audit", userId: "audit", username: "audit", displayName: "Audit", role: "ADMIN", storeId: null };
const roster = new EvaluationReadService(prisma);
const skillBoard = new RosterSkillBoardService(prisma);
const analytics = new AnalyticsV1Service(prisma);

try {
  await cleanup();
  const definitions = await prisma.skillDefinition.findMany({ select: { id: true, skillMode: true } });
  for (const size of sizes) {
    const storeId = `${prefix}${size}`;
    await prisma.store.create({ data: { id: storeId, name: `Audit ${size}`, region: "Sydney", managerName: "Audit", city: "Sydney" } });
    const employees = Array.from({ length: size }, (_, index) => ({
      id: `${prefix}${size}-employee-${index.toString().padStart(3, "0")}`,
      storeId,
      displayName: `Employee ${index.toString().padStart(3, "0")}`,
      employmentType: index % 2 ? "PartTime" as const : "FullTime" as const,
      employeeType: index % 4 ? "REGULAR" as const : "TRAINING" as const,
    }));
    await prisma.employee.createMany({ data: employees });
    await prisma.employeeSkill.createMany({
      data: employees.flatMap((employee) => definitions.map((definition) => ({
        employeeId: employee.id,
        skillDefinitionId: definition.id,
        status: definition.skillMode === "BINARY" ? "CanDo" as const : "Independent" as const,
        updatedBy: "audit",
      }))),
    });
  }

  const results = [];
  for (const size of sizes) {
    const storeId = `${prefix}${size}`;
    await roster.getStoreRoster(storeId, { page: 1, pageSize: 25 }, actor);
    const rosterMs = await measure(() => roster.getStoreRoster(storeId, { page: 1, pageSize: 25 }, actor));
    const boardMs = await measure(() => skillBoard.getBoard([storeId], storeId, actor));
    const dashboardMs = await measure(() => analytics.getDashboard([storeId], storeId, actor));
    const analyticsMs = await measure(() => analytics.getAnalytics([storeId], storeId, undefined, actor));
    results.push({ employees: size, rosterMs, skillBoardMs: boardMs, dashboardMs, analyticsMs });
  }
  console.log(JSON.stringify({ schema, results }));
} finally {
  await cleanup();
  await prisma.$disconnect();
}

async function measure(work: () => Promise<unknown>) {
  const start = performance.now();
  await work();
  return Math.round((performance.now() - start) * 10) / 10;
}

async function cleanup() {
  await prisma.employee.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.userAccount.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.store.deleteMany({ where: { id: { startsWith: prefix } } });
}
