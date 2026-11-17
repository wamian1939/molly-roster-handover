import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AuthContext } from "../src/auth.js";
import { EvaluationRoundService } from "../src/evaluationRoundService.js";
import { EvaluationV1Service } from "../src/evaluationV1Service.js";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as { schema: string; isolatedUrl: string };
const target = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema) || target.searchParams.get("schema") !== state.schema || target.hostname !== "localhost" || target.pathname !== "/evaluate_molly") {
  throw new Error("Refusing to seed outside a local disposable browser-acceptance schema.");
}

const admin: AuthContext = { accountId: "browser-admin", userId: "browser-admin", username: "browser-admin", displayName: "Browser Admin", role: "ADMIN", storeIds: [], canAccessAllStores: true };
const evaluator: AuthContext = { accountId: "browser-evaluator-a", userId: "browser-evaluator-a", username: "browser-evaluator-a", displayName: "Evaluator A", role: "STORE_EVALUATOR", storeIds: ["browser-store"], canAccessAllStores: false };
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const rounds = new EvaluationRoundService(db);
  const submissions = new EvaluationV1Service(db);
  const round = await rounds.getOrCreateOpenRound("browser-regular", evaluator);
  const stored = await db.evaluationRound.findUniqueOrThrow({ where: { id: round.id }, select: { skillBaselineSnapshot: true } });
  if (!Array.isArray(stored.skillBaselineSnapshot)) throw new Error("Round skill baseline is missing.");
  const skills = stored.skillBaselineSnapshot.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid skill baseline.");
    const row = item as Record<string, unknown>;
    if (typeof row.skillDefinitionId !== "string") throw new Error("Invalid skill ID.");
    return { skillDefinitionId: row.skillDefinitionId, status: row.skillMode === "BINARY" ? "CanDo" as const : "Independent" as const };
  });
  await submissions.submitLiveEvaluation(round.id, { speedRating: 5, initiativeRating: 5, attitudeRating: 5, availabilityRating: 5, textFeedback: "", skills }, admin);
  await submissions.submitLiveEvaluation(round.id, { speedRating: 3, initiativeRating: 3, attitudeRating: 3, availabilityRating: 3, textFeedback: "", skills }, evaluator);
  await rounds.closeRound(round.id, admin);
  let openFollowupRoundId: string | null = null;
  if (process.argv.includes("--open-followup")) {
    const followup = await rounds.getOrCreateOpenRound("browser-regular", evaluator);
    await submissions.submitLiveEvaluation(followup.id, { speedRating: 1, initiativeRating: 1, attitudeRating: 1, availabilityRating: 1, textFeedback: "", skills }, evaluator);
    openFollowupRoundId = followup.id;
  }
  if (process.argv.includes("--legacy-identity")) {
    // This mutation is allowed only in the disposable schema validated above.
    await db.$executeRawUnsafe('ALTER TABLE "evaluation_rounds" DISABLE TRIGGER "evaluation_rounds_closed_immutable"');
    try {
      await db.evaluationRound.update({ where: { id: round.id }, data: { employeeDisplayNameSnapshot: null, storeNameSnapshot: null } });
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "evaluation_rounds" ENABLE TRIGGER "evaluation_rounds_closed_immutable"');
    }
    await db.employee.update({ where: { id: "browser-regular" }, data: { displayName: "Current Browser Name" } });
    await db.store.update({ where: { id: "browser-store" }, data: { name: "Current Browser Store" } });
  }
  console.log(JSON.stringify({ seeded: true, roundId: round.id, openFollowupRoundId, employeeId: "browser-regular", storeId: "browser-store", legacyIdentity: process.argv.includes("--legacy-identity") }));
} finally {
  await db.$disconnect();
}
