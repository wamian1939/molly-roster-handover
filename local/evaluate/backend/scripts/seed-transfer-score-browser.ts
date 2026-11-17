import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { EmployeeService } from "../src/employeeService.js";
import { EvaluationRoundService } from "../src/evaluationRoundService.js";
import { EvaluationV1Service } from "../src/evaluationV1Service.js";
import { RosterIntegrationService } from "../src/rosterIntegrationService.js";
import type { AuthContext } from "../src/auth.js";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema) || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Refusing to seed outside a disposable browser-acceptance schema.");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
const employeeId = "browser-transfer-score";
const admin: AuthContext = { accountId: "browser-admin", userId: "browser-admin", username: "browser-admin", displayName: "Browser Admin", role: "ADMIN", storeIds: [], canAccessAllStores: true };
const evaluator: AuthContext = { accountId: "browser-evaluator-a", userId: "browser-evaluator-a", username: "browser-evaluator-a", displayName: "Evaluator A", role: "STORE_EVALUATOR", storeIds: ["browser-store"], canAccessAllStores: false };

try {
  await db.employee.create({ data: { id: employeeId, storeId: "browser-store", displayName: "Transfer Score QA", employmentType: "PartTime", employeeType: "REGULAR" } });
  const round = await new EvaluationRoundService(db).getOrCreateOpenRound(employeeId, evaluator);
  const baseline = await db.evaluationRound.findUniqueOrThrow({ where: { id: round.id }, select: { skillBaselineSnapshot: true } });
  const skills = (baseline.skillBaselineSnapshot as Array<{ skillDefinitionId: string; skillMode: string }>).map((skill) => ({ skillDefinitionId: skill.skillDefinitionId, status: skill.skillMode === "BINARY" ? "CanDo" as const : "Independent" as const }));
  await new EvaluationV1Service(db).submitLiveEvaluation(round.id, { speedRating: 4, initiativeRating: 4, attitudeRating: 4, availabilityRating: 4, textFeedback: "", skills }, evaluator);
  await new EvaluationRoundService(db).closeRound(round.id, admin);
  const before = (await new RosterIntegrationService(db).getEmployee(employeeId)).employee;
  await new EmployeeService(db).updateEmployee(employeeId, { storeId: "browser-other-store" });
  const after = (await new RosterIntegrationService(db).getEmployee(employeeId)).employee;
  if (!before?.officialScore || JSON.stringify(before.officialScore) !== JSON.stringify(after?.officialScore)) {
    throw new Error("Transferred employee did not retain the CLOSED official score.");
  }
  console.log(JSON.stringify({ employeeId, destinationStoreId: "browser-other-store", officialScore: after.officialScore }));
} finally {
  await db.$disconnect();
}
