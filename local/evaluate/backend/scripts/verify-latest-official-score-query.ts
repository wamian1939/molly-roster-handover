import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { latestAggregateByEmployee, loadLatestValidClosedAggregates, loadRoundAggregates } from "../src/roundAggregateRead.js";
import { AnalyticsV1Service } from "../src/analyticsV1Service.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/evaluate_molly" || (target.searchParams.get("schema") ?? "public") !== "public") {
  throw new Error("This read-only score-query comparison is restricted to the local Evaluate development database.");
}

const db = new PrismaClient();
try {
  const employees = await db.employee.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const employeeIds = employees.map((employee) => employee.id);
  const [allRounds, latestRounds] = await Promise.all([
    loadRoundAggregates(db, { employeeIds }),
    loadLatestValidClosedAggregates(db, employeeIds),
  ]);
  const oldOfficial = latestAggregateByEmployee(allRounds);
  const newOfficial = latestAggregateByEmployee(latestRounds);
  const activeEmployees = await db.employee.findMany({ where: { status: "Active", store: { isActive: true } }, select: { id: true } });
  const activeIds = new Set(activeEmployees.map((employee) => employee.id));
  const analytics = await new AnalyticsV1Service(db).getAnalytics();
  const validActiveRoundCount = allRounds.filter((round) => activeIds.has(round.employee.id) && round.aggregateOverall != null).length;
  const analyticsTrendRoundCount = analytics.scoreTrend.reduce((sum, point) => sum + point.completedEvaluations, 0);
  const mismatches = employeeIds.flatMap((id) => {
    const oldRound = oldOfficial.get(id);
    const newRound = newOfficial.get(id);
    return oldRound?.id === newRound?.id
      && oldRound?.aggregateOverall === newRound?.aggregateOverall
      && oldRound?.aggregateTier === newRound?.aggregateTier ? [] : [id];
  });
  console.log(JSON.stringify({
    employees: employeeIds.length,
    oldLoadedRounds: allRounds.length,
    roundsWithoutOfficialAggregate: allRounds.filter((round) => round.aggregateOverall == null).length,
    activeEmployeeRoundsWithoutOfficialAggregate: allRounds.filter((round) => activeIds.has(round.employee.id) && round.aggregateOverall == null).length,
    validActiveRoundCount,
    analyticsTrendRoundCount,
    newLoadedRounds: latestRounds.length,
    oldOfficialEmployees: oldOfficial.size,
    newOfficialEmployees: newOfficial.size,
    mismatches,
    interpretation: "Read-only local development comparison. A match does not prove production parity or large-scale query performance.",
  }, null, 2));
  if (mismatches.length || analyticsTrendRoundCount !== validActiveRoundCount) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
