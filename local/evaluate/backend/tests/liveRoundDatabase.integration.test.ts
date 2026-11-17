import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import express from "express";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EvaluationRoundService } from "../src/evaluationRoundService.js";
import { EvaluationV1Service } from "../src/evaluationV1Service.js";
import { CurrentSkillService } from "../src/currentSkillService.js";
import { EmployeeService } from "../src/employeeService.js";
import { RosterIntegrationService } from "../src/rosterIntegrationService.js";
import { EvaluationReadService } from "../src/evaluationReadService.js";
import { EmployeeEvaluationSummaryService } from "../src/employeeEvaluationSummaryService.js";
import { RosterSkillBoardService } from "../src/rosterSkillBoardService.js";
import { StoreService } from "../src/storeService.js";
import { AnalyticsV1Service } from "../src/analyticsV1Service.js";
import { loadLatestValidClosedAggregates } from "../src/roundAggregateRead.js";
import { AuthService, type AuthContext } from "../src/auth.js";
import { createEvaluationRouter } from "../src/routes.js";

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const schemaName = `codex_live_round_${process.pid}_${Date.now()}`;
const rootUrl = process.env.DATABASE_URL ?? "";
let isolatedUrl = "";
let rootDb: PrismaClient;
let db: PrismaClient;

const admin = actor("account-admin", "Admin", "ADMIN", []);
const evaluatorA = actor("account-a", "Evaluator A", "STORE_EVALUATOR", ["store-live"]);
const evaluatorB = actor("account-b", "Evaluator B", "STORE_EVALUATOR", ["store-live"]);

describeDatabase.sequential("live round database invariants", () => {
  beforeAll(async () => {
    if (!rootUrl) throw new Error("DATABASE_URL is required when RUN_DATABASE_TESTS=1.");
    if (!/^codex_live_round_[a-zA-Z0-9_]+$/.test(schemaName)) throw new Error("Unsafe integration-test schema name.");
    const url = new URL(rootUrl);
    url.searchParams.set("schema", schemaName);
    isolatedUrl = url.toString();
    rootDb = new PrismaClient({ datasourceUrl: rootUrl });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: isolatedUrl },
      stdio: "pipe",
      timeout: 60_000,
    });
    db = new PrismaClient({ datasourceUrl: isolatedUrl });
    await seedFixture(db);
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb && /^codex_live_round_[a-zA-Z0-9_]+$/.test(schemaName)) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  }, 30_000);

  it("keeps GET read-only and creates only one OPEN round under concurrent entry", async () => {
    const roundService = new EvaluationRoundService(db);
    expect(await roundService.getCurrentRound("employee-live", evaluatorA)).toBeNull();
    expect(await db.evaluationRound.count()).toBe(0);
    expect(await db.evaluation.count()).toBe(0);

    const [first, second] = await Promise.all([
      roundService.getOrCreateOpenRound("employee-live", evaluatorA),
      roundService.getOrCreateOpenRound("employee-live", evaluatorB),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.policy).toMatchObject({
      policyId: "REGULAR_V3",
      skillWeight: 60,
      speedWeight: 15,
      initiativeWeight: 5,
      attitudeWeight: 5,
      availabilityWeight: 10,
      textWeight: 5,
    });
    expect(await db.evaluationRound.count({ where: { employeeId: "employee-live", status: "OPEN" } })).toBe(1);
    expect(await db.evaluation.count()).toBe(0);
  }, 30_000);

  it("UPSERTs one latest evaluator row and changes the OPEN denominator dynamically", async () => {
    const roundService = new EvaluationRoundService(db);
    const evaluationService = new EvaluationV1Service(db);
    const round = await roundService.getCurrentRound("employee-live", evaluatorA);
    if (!round) throw new Error("Expected the OPEN round from the preceding test.");

    await evaluationService.submitLiveEvaluation(round.id, await submission(db, round.id, 2, "CannotDo"), evaluatorA);
    const first = await db.evaluation.findUniqueOrThrow({ where: { roundId_evaluatorAccountId: { roundId: round.id, evaluatorAccountId: evaluatorA.accountId } } });
    expect((await db.evaluationSkillSnapshot.findFirstOrThrow({ where: { evaluationId: first.id, skillCode: "opening-live" } })).status).toBe("CannotDo");
    expect((await db.employeeSkill.findFirstOrThrow({ where: { employeeId: "employee-live", skillDefinitionId: "skill-opening" } })).status).toBe("CanDo");
    await evaluationService.submitLiveEvaluation(round.id, await submission(db, round.id, 5), evaluatorA);
    const updated = await db.evaluation.findUniqueOrThrow({ where: { roundId_evaluatorAccountId: { roundId: round.id, evaluatorAccountId: evaluatorA.accountId } } });

    expect(updated.id).toBe(first.id);
    expect(updated.speedRating).toBe(5);
    expect(Number(updated.speedScoreV1)).toBe(15);
    expect(updated.version).toBe(first.version + 1);
    expect(await db.evaluation.count({ where: { roundId: round.id, evaluatorAccountId: evaluatorA.accountId } })).toBe(1);

    const before = await roundService.getRound(round.id, admin);
    expect(before).toMatchObject({ completedCount: 1, eligibleCount: 2 });
    await db.userAccount.create({ data: { ...accountData("account-c", "evaluator-c", "Evaluator C", "STORE_EVALUATOR"), storeAccesses: { create: { storeId: "store-live" } } } });
    const after = await roundService.getRound(round.id, admin);
    expect(after).toMatchObject({ completedCount: 1, eligibleCount: 3 });
  }, 30_000);

  it("keeps ADMIN outside store progress and aggregate", async () => {
    const roundService = new EvaluationRoundService(db);
    const evaluationService = new EvaluationV1Service(db);
    const round = await roundService.getCurrentRound("employee-live", admin);
    if (!round) throw new Error("Expected an OPEN round.");
    await evaluationService.submitLiveEvaluation(round.id, await submission(db, round.id, 5), admin);

    const aggregate = await roundService.getAggregate(round.id, admin);
    expect(aggregate).toMatchObject({ completedCount: 1, eligibleCount: 3 });
    expect(aggregate.adminEvaluation?.overallScore).not.toBeNull();
    expect(aggregate.aggregateOverall).toBe(aggregate.evaluators[0]?.evaluation?.overallScore);
    await expect(roundService.getAggregate(round.id, evaluatorA)).rejects.toMatchObject({ status: 403 });
    await expect(roundService.closeRound(round.id, evaluatorA)).rejects.toMatchObject({ status: 403 });
  }, 30_000);

  it("freezes a partial close and routes the next submission into Round 2", async () => {
    const roundService = new EvaluationRoundService(db);
    const evaluationService = new EvaluationV1Service(db);
    const round1 = await roundService.getCurrentRound("employee-live", admin);
    if (!round1) throw new Error("Expected Round 1.");
    await evaluationService.submitLiveEvaluation(round1.id, await submission(db, round1.id, 3, "CannotDo"), evaluatorB);
    const beforeClose = await db.evaluation.findUniqueOrThrow({ where: { roundId_evaluatorAccountId: { roundId: round1.id, evaluatorAccountId: evaluatorA.accountId } } });
    expect((await db.evaluationSkillSnapshot.findFirstOrThrow({ where: { evaluationId: beforeClose.id, skillCode: "opening-live" } })).status).toBe("CanDo");
    expect((await db.evaluationSkillSnapshot.findFirstOrThrow({ where: { evaluationId: (await db.evaluation.findUniqueOrThrow({ where: { roundId_evaluatorAccountId: { roundId: round1.id, evaluatorAccountId: evaluatorB.accountId } } })).id, skillCode: "opening-live" } })).status).toBe("CannotDo");

    const closed = await roundService.closeRound(round1.id, admin);
    expect(closed).toMatchObject({ status: "CLOSED", completedCount: 2, eligibleCount: 3, aggregateStatus: "FINAL" });
    expect(closed.closedAt).toBeTruthy();
    expect(await db.evaluationRoundEvaluator.count({ where: { roundId: round1.id } })).toBe(3);
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: beforeClose.id } })).evaluationStatus).toBe("Completed");
    expect((await db.employeeSkill.findFirstOrThrow({ where: { employeeId: "employee-live", skillDefinitionId: "skill-opening" } })).status).toBe("CanDo");
    const historyService = new EvaluationReadService(db);
    const evaluatorHistory = await historyService.listClosedRoundHistory({ employeeId: "employee-live" }, ["store-live"], evaluatorA);
    expect(evaluatorHistory.items[0]).not.toHaveProperty("adminScore");
    expect(evaluatorHistory.items[0]).not.toHaveProperty("adminEvaluatorName");
    const adminHistory = await historyService.listClosedRoundHistory({ employeeId: "employee-live" }, undefined, admin);
    expect(adminHistory.items[0]?.adminScore).not.toBeNull();

    await expect(db.evaluation.update({ where: { id: beforeClose.id }, data: { speedRating: 1 } })).rejects.toThrow(/immutable/i);
    const snapshot = await db.evaluationSkillSnapshot.findFirstOrThrow({ where: { evaluationId: beforeClose.id, skillCode: "opening-live" } });
    await expect(db.evaluationSkillSnapshot.update({ where: { id: snapshot.id }, data: { status: "CannotDo" } })).rejects.toThrow(/immutable/i);
    await expect(db.evaluationRound.update({ where: { id: round1.id }, data: { finalAggregateOverall: 1 } })).rejects.toThrow(/immutable/i);

    const round2 = await roundService.getOrCreateOpenRound("employee-live", evaluatorA);
    expect(round2.roundNumber).toBe(2);
    expect(round2.id).not.toBe(round1.id);
    await evaluationService.submitLiveEvaluation(round2.id, await submission(db, round2.id, 4), evaluatorA);
    expect(await db.evaluation.count({ where: { roundId: round2.id } })).toBe(1);
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: beforeClose.id } })).speedRating).toBe(5);
  }, 30_000);

  it("serializes duplicate submits and close-versus-submit races", async () => {
    const roundService = new EvaluationRoundService(db);
    const evaluationService = new EvaluationV1Service(db);

    const doubleRound = await roundService.getOrCreateOpenRound("employee-double", evaluatorA);
    await Promise.all([
      evaluationService.submitLiveEvaluation(doubleRound.id, await submission(db, doubleRound.id, 2), evaluatorA),
      evaluationService.submitLiveEvaluation(doubleRound.id, await submission(db, doubleRound.id, 5), evaluatorA),
    ]);
    expect(await db.evaluation.count({ where: { roundId: doubleRound.id, evaluatorAccountId: evaluatorA.accountId } })).toBe(1);

    const raceRound = await roundService.getOrCreateOpenRound("employee-race", evaluatorA);
    const [closeResult, submitResult] = await Promise.allSettled([
      roundService.closeRound(raceRound.id, admin),
      evaluationService.submitLiveEvaluation(raceRound.id, await submission(db, raceRound.id, 4), evaluatorB),
    ]);
    expect(closeResult.status).toBe("fulfilled");
    const frozen = await roundService.getRound(raceRound.id, admin);
    expect(frozen.status).toBe("CLOSED");
    const racedRows = await db.evaluation.findMany({ where: { roundId: raceRound.id, evaluatorAccountId: evaluatorB.accountId } });
    expect(racedRows).toHaveLength(submitResult.status === "fulfilled" ? 1 : 0);
    if (racedRows[0]) expect(racedRows[0].evaluationStatus).toBe("Completed");

    const nextRound = await roundService.getOrCreateOpenRound("employee-race", evaluatorB);
    expect(nextRound.roundNumber).toBe(2);
    await expect(evaluationService.submitLiveEvaluation(nextRound.id, await submission(db, nextRound.id, 3), evaluatorB)).resolves.toBeTruthy();
  }, 30_000);

  it("requires explicit current-skill confirmation and keeps CLOSED snapshots unchanged", async () => {
    const currentSkillService = new CurrentSkillService(db);
    const before = (await currentSkillService.list("employee-live")).find((skill) => skill.id === "skill-opening");
    expect(before?.status).toBe("CanDo");
    if (!before) throw new Error("Expected the current operation skill.");
    await expect(currentSkillService.confirm("employee-live", "skill-opening", "Training", before.updatedAt, admin.accountId)).rejects.toMatchObject({ status: 400 });
    const changed = (await currentSkillService.confirm("employee-live", "skill-opening", "CannotDo", before.updatedAt, admin.accountId)).find((skill) => skill.id === "skill-opening");
    expect(changed?.status).toBe("CannotDo");
    await expect(currentSkillService.confirm("employee-live", "skill-opening", "CanDo", before.updatedAt, admin.accountId)).rejects.toMatchObject({ status: 409 });
    if (!changed) throw new Error("Expected the confirmed skill to remain visible.");
    const concurrent = await Promise.allSettled([
      currentSkillService.confirm("employee-live", "skill-opening", "CanDo", changed.updatedAt, admin.accountId),
      currentSkillService.confirm("employee-live", "skill-opening", "Unknown", changed.updatedAt, admin.accountId),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
    const closed = await db.evaluationRound.findFirstOrThrow({ where: { employeeId: "employee-live", status: "CLOSED" }, include: { evaluations: { include: { skillSnapshots: true } } } });
    expect(closed.evaluations.map((evaluation) => evaluation.skillSnapshots.find((skill) => skill.skillCode === "opening-live")?.status).sort()).toEqual(["CanDo", "CanDo", "CannotDo"]);
    const historicalDetail = await new EvaluationRoundService(db).getRound(closed.id, admin);
    expect(historicalDetail.employee).toEqual({ id: "employee-live", displayName: closed.employeeDisplayNameSnapshot });
    expect(historicalDetail.employee).not.toHaveProperty("skills");

    await db.skillDefinition.create({ data: { id: "skill-new", code: "new-progressive", nameZh: "New Skill", nameEn: "New Skill", category: "Bar", skillMode: "PROGRESSIVE", weight: 1, displayOrder: 2 } });
    const missing = (await currentSkillService.list("employee-live")).find((skill) => skill.id === "skill-new");
    expect(missing).toMatchObject({ status: "Unknown", updatedAt: null });
    expect((await currentSkillService.confirm("employee-live", "skill-new", "NotTrained", null, admin.accountId)).find((skill) => skill.id === "skill-new")?.status).toBe("NotTrained");
  }, 30_000);

  it("records unchanged skill approval immutably and rolls back a failed confirmation", async () => {
    const service = new CurrentSkillService(db);
    const current = await db.employeeSkill.findUniqueOrThrow({
      where: { employeeId_skillDefinitionId: { employeeId: "employee-live", skillDefinitionId: "skill-new" } },
    });
    const snapshotsBefore = await db.evaluationSkillSnapshot.count({ where: { evaluation: { employeeId: "employee-live" } } });
    await service.confirm("employee-live", "skill-new", "NotTrained", current.updatedAt.toISOString(), admin.accountId, "Manager reviewed the qualification record");
    const confirmation = await db.currentSkillConfirmation.findFirstOrThrow({
      where: { employeeId: "employee-live", skillDefinitionId: "skill-new" }, orderBy: { confirmedAt: "desc" },
    });
    expect(confirmation).toMatchObject({ previousStatus: "NotTrained", confirmedStatus: "NotTrained", confirmedByAccountId: admin.accountId, reason: "Manager reviewed the qualification record" });
    const firstPage = await service.listConfirmations("employee-live", "skill-new", 1, 1);
    expect(firstPage).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(firstPage.items[0]).toMatchObject({
      id: confirmation.id, previousStatus: "NotTrained", confirmedStatus: "NotTrained",
      confirmedByAccountId: admin.accountId, confirmedByName: admin.displayName,
    });
    const secondPage = await service.listConfirmations("employee-live", "skill-new", 2, 1);
    expect(secondPage.items[0]).toMatchObject({ previousStatus: null, confirmedStatus: "NotTrained" });
    expect(await service.listConfirmations("employee-race", "skill-new", 1, 5)).toMatchObject({ total: 0, items: [] });
    expect(await db.evaluationSkillSnapshot.count({ where: { evaluation: { employeeId: "employee-live" } } })).toBe(snapshotsBefore);
    await expect(db.currentSkillConfirmation.update({ where: { id: confirmation.id }, data: { reason: "rewrite" } })).rejects.toThrow();
    await expect(db.currentSkillConfirmation.delete({ where: { id: confirmation.id } })).rejects.toThrow();

    const beforeFailure = await db.employeeSkill.findUniqueOrThrow({ where: { id: current.id } });
    const eventCount = await db.currentSkillConfirmation.count({ where: { employeeId: "employee-live", skillDefinitionId: "skill-new" } });
    await expect(service.confirm("employee-live", "skill-new", "Training", beforeFailure.updatedAt.toISOString(), admin.accountId, "x".repeat(501))).rejects.toThrow();
    const afterFailure = await db.employeeSkill.findUniqueOrThrow({ where: { id: current.id } });
    expect(afterFailure.status).toBe("NotTrained");
    expect(afterFailure.updatedAt).toEqual(beforeFailure.updatedAt);
    expect(await db.currentSkillConfirmation.count({ where: { employeeId: "employee-live", skillDefinitionId: "skill-new" } })).toBe(eventCount);
  }, 30_000);

  it("serializes archive and transfer against creation of an OPEN round", async () => {
    const roundService = new EvaluationRoundService(db);
    const employeeService = new EmployeeService(db);
    await db.store.create({ data: { id: "store-transfer", name: "Transfer Store", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    for (const action of ["archive", "transfer"] as const) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = `employee-${action}-${attempt}`;
        await db.employee.create({ data: { id, storeId: "store-live", displayName: id, employmentType: "PartTime", employeeType: "REGULAR" } });
        const results = await Promise.allSettled([
          roundService.getOrCreateOpenRound(id, evaluatorA),
          action === "archive"
            ? employeeService.archiveEmployee(id)
            : employeeService.updateEmployee(id, { storeId: "store-transfer" }),
        ]);
        const employee = await db.employee.findUniqueOrThrow({ where: { id } });
        const openRounds = await db.evaluationRound.findMany({ where: { employeeId: id, status: "OPEN" } });
        if (action === "archive") expect(openRounds).toHaveLength(employee.status === "Active" ? 1 : 0);
        else {
          expect(employee.storeId).toBe("store-transfer");
          expect(openRounds.every((round) => round.storeId === employee.storeId)).toBe(true);
          expect(results[1]?.status).toBe("fulfilled");
        }
        expect(results.some((result) => result.status === "fulfilled")).toBe(true);
        if (results[1]?.status === "rejected") expect(results[1].reason).toMatchObject({ status: 409 });
      }
    }
  }, 60_000);

  it("moves OPEN submissions, CLOSED history, notes and AI analysis without changing scores", async () => {
    const employeeId = "employee-transfer-all";
    await db.employee.create({ data: { id: employeeId, storeId: "store-live", displayName: "Transfer All", employmentType: "PartTime" } });
    const rounds = new EvaluationRoundService(db);
    const scores = new EvaluationV1Service(db);
    const closed = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
    await scores.submitLiveEvaluation(closed.id, await submission(db, closed.id, 4), evaluatorA);
    await rounds.closeRound(closed.id, admin);
    const open = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
    await scores.submitLiveEvaluation(open.id, await submission(db, open.id, 3), evaluatorA);
    await db.performanceNote.create({ data: { employeeId, storeId: "store-live", noteType: "Coaching", noteText: "Transfer fixture" } });
    await db.aiAnalysisRun.create({ data: { employeeId, storeId: "store-live", evaluationPeriod: "fixture", provider: "fixture", model: "fixture", status: "success", textReviewSnapshot: "Fixture", aiTextScore: 70 } });
    const before = await db.evaluation.findMany({ where: { employeeId }, orderBy: { id: "asc" } });
    const roundBefore = await db.evaluationRound.findMany({ where: { employeeId }, orderBy: { id: "asc" } });
    const snapshots = await db.evaluationSkillSnapshot.findMany({ where: { evaluation: { employeeId } }, orderBy: { id: "asc" } });
    await new EmployeeService(db).updateEmployee(employeeId, { storeId: "store-transfer" });
    const stripStore = (row: { storeId: string; storeNameSnapshot: string | null }) => Object.fromEntries(Object.entries(row).filter(([key]) => !["storeId", "storeNameSnapshot"].includes(key)));
    const after = await db.evaluation.findMany({ where: { employeeId }, orderBy: { id: "asc" } });
    const roundAfter = await db.evaluationRound.findMany({ where: { employeeId }, orderBy: { id: "asc" } });
    expect(after.map(stripStore)).toEqual(before.map(stripStore));
    expect(roundAfter.map(stripStore)).toEqual(roundBefore.map(stripStore));
    expect([...after, ...roundAfter].every((row) => row.storeId === "store-transfer" && row.storeNameSnapshot === "Transfer Store")).toBe(true);
    expect(await db.evaluationSkillSnapshot.findMany({ where: { evaluation: { employeeId } }, orderBy: { id: "asc" } })).toEqual(snapshots);
    expect(await db.performanceNote.findFirstOrThrow({ where: { employeeId } })).toMatchObject({ storeId: "store-transfer", noteText: "Transfer fixture" });
    expect(await db.aiAnalysisRun.findFirstOrThrow({ where: { employeeId } })).toMatchObject({ storeId: "store-transfer", aiTextScore: 70 });
    await expect(rounds.getRound(open.id, evaluatorA)).rejects.toMatchObject({ status: 403 });
    await expect(scores.submitLiveEvaluation(open.id, await submission(db, open.id, 5), evaluatorA)).rejects.toMatchObject({ status: 403 });
    await expect(db.evaluation.update({ where: { id: before.find((row) => row.roundId === closed.id)!.id }, data: { overallScoreV1: 1 } })).rejects.toThrow();
    await expect(db.evaluationRound.update({ where: { id: closed.id }, data: { finalAggregateOverall: 1 } })).rejects.toThrow();
    const history = await new EvaluationReadService(db).listClosedRoundHistory({ storeId: "store-transfer", page: 1, pageSize: 100 }, ["store-transfer"], admin);
    expect(history.items.some((item) => item.id === closed.id && item.storeName === "Transfer Store")).toBe(true);
  }, 30_000);

  it("accepts a real authenticated HTTP transfer with an OPEN evaluation and moves its history", async () => {
    const employeeId = "employee-transfer-all";
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({ data: { userId: admin.accountId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    const app = express();
    app.use(express.json());
    app.use("/api", createEvaluationRouter(
      undefined, new EmployeeService(db), undefined, new StoreService(db), new EvaluationV1Service(db),
      new EmployeeEvaluationSummaryService(db), new EvaluationReadService(db), undefined, undefined,
      new AuthService(db), undefined, new EvaluationRoundService(db),
    ));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing HTTP test port");
      const base = `http://127.0.0.1:${address.port}/api`;
      const headers = { cookie: `evaluate_molly_session=${token}`, "content-type": "application/json" };
      const response = await fetch(`${base}/employees/${employeeId}`, { method: "PUT", headers, body: JSON.stringify({ storeId: "store-live" }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id: employeeId, storeId: "store-live" });
      const current = await fetch(`${base}/employees/${employeeId}/evaluation-rounds/current`, { headers });
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({ status: "OPEN", store: { id: "store-live" } });
      const summary = await fetch(`${base}/employees/${employeeId}/evaluation-summary`, { headers });
      expect(summary.status).toBe(200);
      const detail = await summary.json();
      expect(detail.officialScore.score).toBeGreaterThan(0);
      expect(detail.history.every((item: { storeId: string }) => item.storeId === "store-live")).toBe(true);
      console.log("HTTP transfer verified: PUT 200, OPEN evaluation retained, scores and history available in destination");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await db.authSession.deleteMany({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    }
  }, 30_000);

  it("keeps the latest CLOSED official score with the canonical employee after transfer", async () => {
    const roundService = new EvaluationRoundService(db);
    const employeeService = new EmployeeService(db);
    const integration = new RosterIntegrationService(db);
    const round = await roundService.getCurrentRound("employee-live", admin);
    if (!round) throw new Error("Expected the second OPEN round.");
    await roundService.closeRound(round.id, admin);
    const before = await integration.getEmployee("employee-live");
    expect(before.employee?.officialScore?.roundId).toBe(round.id);
    await employeeService.updateEmployee("employee-live", { storeId: "store-transfer" });
    expect((await integration.listEmployees("store-live", ["store-live"])).employees.some((employee) => employee.id === "employee-live")).toBe(false);
    expect((await integration.getEmployee("employee-live", ["store-live"])).employee).toBeNull();
    expect((await integration.getEmployee("employee-live", ["store-transfer"])).employee?.id).toBe("employee-live");
    const after = await integration.listEmployees("store-transfer");
    const transferred = after.employees.find((employee) => employee.id === "employee-live");
    expect(transferred?.officialScore).toEqual(before.employee?.officialScore);
    const storeRoster = await new EvaluationReadService(db).getStoreRoster("store-transfer", {}, admin);
    expect(storeRoster.items.find((item) => item.employee.id === "employee-live")?.latestCompletedEvaluation?.roundId).toBe(round.id);
    const detail = await new EmployeeEvaluationSummaryService(db).getSummary("employee-live", ["store-transfer"], admin);
    expect(detail.officialScore?.roundId).toBe(round.id);
    expect(detail.latestRound?.id).toBe(round.id);
    expect(detail.history.some((item) => item.id === round.id && item.storeId === "store-transfer")).toBe(true);
    const board = await new RosterSkillBoardService(db).getBoard(["store-transfer"], "store-transfer", admin);
    expect(board.employees.find((employee) => employee.employeeId === "employee-live")?.latestEvaluation?.id).toBe(round.id);
    await db.userAccountStoreAccess.create({ data: { accountId: evaluatorA.accountId, storeId: "store-transfer" } });
    const transferredEvaluator = { ...evaluatorA, storeIds: ["store-live", "store-transfer"] };
    const destinationRound = await roundService.getOrCreateOpenRound("employee-live", transferredEvaluator);
    await new EvaluationV1Service(db).submitLiveEvaluation(destinationRound.id, await submission(db, destinationRound.id, 3), transferredEvaluator);
    const whileOpen = await integration.getEmployee("employee-live");
    expect(whileOpen.employee?.officialScore?.roundId).toBe(round.id);
    await roundService.closeRound(destinationRound.id, admin);
    const afterClose = await integration.getEmployee("employee-live");
    expect(afterClose.employee?.officialScore?.roundId).toBe(destinationRound.id);
    expect(await db.evaluationRound.count({ where: { employeeId: "employee-live", status: "CLOSED" } })).toBe(3);
  }, 30_000);

  it("removes an archived employee from current Roster workforce while retaining scoped detail and CLOSED history", async () => {
    const integration = new RosterIntegrationService(db);
    const before = await integration.getEmployee("employee-live", ["store-transfer"]);
    const roundId = before.employee?.officialScore?.roundId;
    expect(roundId).toBeTruthy();
    await new EmployeeService(db).archiveEmployee("employee-live");
    expect((await integration.listEmployees("store-transfer", ["store-transfer"])).employees.some((employee) => employee.id === "employee-live")).toBe(false);
    const archived = await integration.getEmployee("employee-live", ["store-transfer"]);
    expect(archived.employee).toMatchObject({ id: "employee-live", storeId: "store-transfer", isActive: false });
    expect(archived.employee?.officialScore?.roundId).toBe(roundId);
    expect((await integration.getEmployee("employee-live", ["store-live"])).employee).toBeNull();
    expect(await db.evaluationRound.count({ where: { employeeId: "employee-live", status: "CLOSED" } })).toBe(3);
  }, 30_000);

  it("retains the latest valid CLOSED aggregate when a later round closes without a result", async () => {
    const employeeId = "employee-empty-latest";
    await db.employee.create({ data: { id: employeeId, storeId: "store-live", displayName: "Empty Latest", employmentType: "PartTime", employeeType: "REGULAR" } });
    const rounds = new EvaluationRoundService(db);
    const integration = new RosterIntegrationService(db);
    const first = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
    await new EvaluationV1Service(db).submitLiveEvaluation(first.id, await submission(db, first.id, 4), evaluatorA);
    await rounds.closeRound(first.id, admin);
    expect((await integration.getEmployee(employeeId)).employee?.officialScore?.roundId).toBe(first.id);
    const trendBeforeEmptyClose = (await new AnalyticsV1Service(db).getAnalytics(["store-live"], "store-live", undefined, admin)).scoreTrend;

    const second = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
    const closed = await rounds.closeRound(second.id, admin);
    expect(closed.aggregateOverall).toBeNull();
    const selected = await loadLatestValidClosedAggregates(db, [employeeId]);
    expect(selected.map((round) => round.id)).toEqual([first.id]);
    expect((await integration.getEmployee(employeeId)).employee?.officialScore?.roundId).toBe(first.id);
    expect((await integration.listEmployees("store-live")).employees.find((employee) => employee.id === employeeId)?.officialScore?.roundId).toBe(first.id);
    const roster = await new EvaluationReadService(db).getStoreRoster("store-live", {}, admin);
    expect(roster.items.find((item) => item.employee.id === employeeId)?.latestCompletedEvaluation?.roundId).toBe(first.id);
    const summary = await new EmployeeEvaluationSummaryService(db).getSummary(employeeId, ["store-live"], admin);
    expect(summary.officialScore?.roundId).toBe(first.id);
    expect(summary.latestRound?.id).toBe(first.id);
    expect(summary.history.some((item) => item.id === first.id)).toBe(true);
    const history = await new EvaluationReadService(db).listClosedRoundHistory({ employeeId }, ["store-live"], admin);
    expect(history.items.map((item) => item.id)).toEqual([second.id, first.id]);
    const board = await new RosterSkillBoardService(db).getBoard(["store-live"], "store-live", admin);
    expect(board.employees.find((employee) => employee.employeeId === employeeId)?.latestEvaluation?.id).toBe(first.id);
    const dashboard = await new AnalyticsV1Service(db).getDashboard(["store-live"], "store-live", admin);
    expect(dashboard.topEmployees.find((employee) => employee.employeeId === employeeId)?.overallScore).toBe(Number(selected[0]?.aggregateOverall));
    const analytics = await new AnalyticsV1Service(db).getAnalytics(["store-live"], "store-live", undefined, admin);
    expect(analytics.employees.find((employee) => employee.employeeId === employeeId)?.overallScore).toBe(Number(selected[0]?.aggregateOverall));
    expect(analytics.scoreTrend).toEqual(trendBeforeEmptyClose);
  }, 30_000);

  it("reads unanimous legacy evaluation labels after master data is renamed", async () => {
    const employeeId = "employee-legacy-identity";
    await db.employee.create({ data: { id: employeeId, storeId: "store-live", displayName: "Original Name", employmentType: "PartTime", employeeType: "REGULAR" } });
    const rounds = new EvaluationRoundService(db);
    const opened = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
    await new EvaluationV1Service(db).submitLiveEvaluation(opened.id, await submission(db, opened.id, 3), evaluatorA);
    const closed = await rounds.closeRound(opened.id, admin);
    expect(closed.identitySources).toEqual({ employeeName: "ROUND_CLOSE_SNAPSHOT", storeName: "ROUND_CLOSE_SNAPSHOT" });

    // Simulate pre-snapshot legacy data only inside this disposable schema.
    await db.$executeRawUnsafe('ALTER TABLE "evaluation_rounds" DISABLE TRIGGER "evaluation_rounds_closed_immutable"');
    try {
      await db.evaluationRound.update({ where: { id: opened.id }, data: { employeeDisplayNameSnapshot: null, storeNameSnapshot: null } });
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "evaluation_rounds" ENABLE TRIGGER "evaluation_rounds_closed_immutable"');
    }
    await db.employee.update({ where: { id: employeeId }, data: { displayName: "Current Name" } });
    await db.store.update({ where: { id: "store-live" }, data: { name: "Current Store Name" } });

    const detail = await rounds.getRound(opened.id, evaluatorA);
    expect(detail.employee.displayName).toBe("Original Name");
    expect(detail.store.name).toBe("Live Store");
    expect(detail.identitySources).toEqual({ employeeName: "EVALUATION_SNAPSHOT", storeName: "EVALUATION_SNAPSHOT" });
    const history = await new EvaluationReadService(db).listClosedRoundHistory({ employeeId }, ["store-live"], evaluatorA);
    expect(history.items[0]).toMatchObject({ employeeName: "Original Name", storeName: "Live Store", identitySources: detail.identitySources });
  }, 30_000);

  it("archives a store without retaining ADMIN OPEN scores or deleting CLOSED history", async () => {
    const storeId = "store-archive-live";
    const employeeId = "employee-archive-live";
    const evaluatorId = "account-archive-live";
    const scopedEvaluator = actor(evaluatorId, "Archive Evaluator", "STORE_EVALUATOR", [storeId]);
    await db.store.create({ data: { id: storeId, name: "Archive Store", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    await db.employee.create({ data: { id: employeeId, storeId, displayName: "Archive Employee", employmentType: "PartTime", employeeType: "REGULAR" } });
    await db.userAccount.create({ data: { ...accountData(evaluatorId, "archive-evaluator", "Archive Evaluator", "STORE_EVALUATOR"), storeAccesses: { create: { storeId } } } });

    const rounds = new EvaluationRoundService(db);
    const submissions = new EvaluationV1Service(db);
    const first = await rounds.getOrCreateOpenRound(employeeId, scopedEvaluator);
    await submissions.submitLiveEvaluation(first.id, await submission(db, first.id, 4), scopedEvaluator);
    await rounds.closeRound(first.id, admin);
    const closedEvaluation = await db.evaluation.findUniqueOrThrow({ where: { roundId_evaluatorAccountId: { roundId: first.id, evaluatorAccountId: evaluatorId } } });

    const second = await rounds.getOrCreateOpenRound(employeeId, scopedEvaluator);
    await submissions.submitLiveEvaluation(second.id, await submission(db, second.id, 3), scopedEvaluator);
    await submissions.submitLiveEvaluation(second.id, await submission(db, second.id, 5), admin);
    expect(await db.evaluation.count({ where: { roundId: second.id } })).toBe(2);

    await new StoreService(db).archiveStore(storeId);
    const integration = new RosterIntegrationService(db);
    expect((await integration.listStores()).stores.some((store) => store.id === storeId)).toBe(false);
    expect((await integration.listEmployees(storeId)).employees).toEqual([]);
    const archivedDetail = (await integration.getEmployee(employeeId)).employee;
    expect(archivedDetail).toMatchObject({ id: employeeId, storeId, isActive: false });
    expect(archivedDetail?.officialScore?.roundId).toBe(first.id);
    expect(await db.evaluation.count({ where: { roundId: second.id } })).toBe(0);
    expect(await db.evaluation.findUnique({ where: { id: closedEvaluation.id } })).toMatchObject({ evaluationStatus: "Completed" });
    expect(await db.evaluationRound.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "CLOSED" });
    expect(await db.evaluationRound.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "OPEN" });
    await expect(rounds.closeRound(second.id, admin)).rejects.toMatchObject({ status: 409 });
    expect(await db.userAccount.findUniqueOrThrow({ where: { id: evaluatorId } })).toMatchObject({ isActive: false });
  }, 30_000);

  it("waits for a concurrent store archive before accepting an OPEN submission", async () => {
    const storeId = "store-archive-race";
    const employeeId = "employee-archive-race";
    await db.store.create({ data: { id: storeId, name: "Archive Race", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    await db.employee.create({ data: { id: employeeId, storeId, displayName: "Archive Race Employee", employmentType: "PartTime", employeeType: "REGULAR" } });
    const opened = await new EvaluationRoundService(db).getOrCreateOpenRound(employeeId, admin);
    const input = await submission(db, opened.id, 4);
    let pending: ReturnType<EvaluationV1Service["submitLiveEvaluation"]> | undefined;
    let settled = false;
    await db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data: { isActive: false, archivedAt: new Date() } });
      pending = new EvaluationV1Service(db).submitLiveEvaluation(opened.id, input, admin);
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(settled).toBe(false);
    });
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(await db.evaluation.count({ where: { roundId: opened.id } })).toBe(0);
  }, 30_000);

  it("waits for a concurrent store archive before creating an OPEN round", async () => {
    const storeId = "store-open-race";
    const employeeId = "employee-open-race";
    await db.store.create({ data: { id: storeId, name: "Open Race", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    await db.employee.create({ data: { id: employeeId, storeId, displayName: "Open Race Employee", employmentType: "PartTime", employeeType: "REGULAR" } });
    let pending: ReturnType<EvaluationRoundService["getOrCreateOpenRound"]> | undefined;
    let settled = false;
    await db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data: { isActive: false, archivedAt: new Date() } });
      pending = new EvaluationRoundService(db).getOrCreateOpenRound(employeeId, admin);
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(settled).toBe(false);
    });
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(await db.evaluationRound.count({ where: { employeeId } })).toBe(0);
  }, 30_000);

  it("does not close an OPEN round after a concurrent store archive", async () => {
    const storeId = "store-close-race";
    const employeeId = "employee-close-race";
    await db.store.create({ data: { id: storeId, name: "Close Race", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    await db.employee.create({ data: { id: employeeId, storeId, displayName: "Close Race Employee", employmentType: "PartTime", employeeType: "REGULAR" } });
    const rounds = new EvaluationRoundService(db);
    const opened = await rounds.getOrCreateOpenRound(employeeId, admin);
    let pending: ReturnType<EvaluationRoundService["closeRound"]> | undefined;
    let settled = false;
    await db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data: { isActive: false, archivedAt: new Date() } });
      pending = rounds.closeRound(opened.id, admin);
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(settled).toBe(false);
    });
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(await db.evaluationRound.findUniqueOrThrow({ where: { id: opened.id } })).toMatchObject({ status: "OPEN" });
  }, 30_000);

  it("retries store archive after a concurrent store-row update", async () => {
    const storeId = "store-archive-retry";
    await db.store.create({ data: { id: storeId, name: "Archive Retry", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    let pending: ReturnType<StoreService["archiveStore"]> | undefined;
    let settled = false;
    await db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data: { name: "Archive Retry Updated" } });
      pending = new StoreService(db).archiveStore(storeId);
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(settled).toBe(false);
    });
    await expect(pending).resolves.toMatchObject({ id: storeId, isActive: false, name: "Archive Retry Updated" });
    expect(await db.store.findUniqueOrThrow({ where: { id: storeId } })).toMatchObject({ isActive: false });
  }, 30_000);

  it("filters CLOSED history job snapshots and paginates in PostgreSQL", async () => {
    const job = await db.storeJobDefinition.create({ data: { storeId: "store-live", name: "History Job", code: "history-job", displayOrder: 99 } });
    const employeeIds = ["employee-history-job", "employee-history-no-job"];
    await db.employee.createMany({ data: employeeIds.map((id) => ({ id, storeId: "store-live", displayName: id, employmentType: "PartTime" as const, employeeType: "REGULAR" as const })) });
    await db.employeeJobAssignment.create({ data: { employeeId: employeeIds[0]!, jobId: job.id, storeId: "store-live", assignedByAccountId: admin.accountId } });
    const rounds = new EvaluationRoundService(db);
    const submissions = new EvaluationV1Service(db);
    for (const employeeId of employeeIds) {
      const opened = await rounds.getOrCreateOpenRound(employeeId, evaluatorA);
      await submissions.submitLiveEvaluation(opened.id, await submission(db, opened.id, 4), evaluatorA);
      await rounds.closeRound(opened.id, admin);
    }
    const history = new EvaluationReadService(db);
    const filtered = await history.listClosedRoundHistory({ storeId: "store-live", jobId: job.id, page: 1, pageSize: 1 }, ["store-live"], evaluatorA);
    expect(filtered).toMatchObject({ total: 1, totalPages: 1, page: 1, pageSize: 1 });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({ employeeId: employeeIds[0], jobsSnapshot: [{ id: job.id }] });
    const first = await history.listClosedRoundHistory({ storeId: "store-live", page: 1, pageSize: 1 }, ["store-live"], evaluatorA);
    const second = await history.listClosedRoundHistory({ storeId: "store-live", page: 2, pageSize: 1 }, ["store-live"], evaluatorA);
    expect(first.total).toBeGreaterThan(1);
    expect(first.total).toBe(second.total);
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
  }, 30_000);
});

async function seedFixture(client: PrismaClient) {
  await client.store.create({ data: { id: "store-live", name: "Live Store", region: "Sydney", managerName: "Manager", city: "Sydney" } });
  await client.userAccount.createMany({ data: [
    accountData(admin.accountId, "admin-live", admin.displayName, admin.role),
    accountData(evaluatorA.accountId, "evaluator-a", evaluatorA.displayName, evaluatorA.role),
    accountData(evaluatorB.accountId, "evaluator-b", evaluatorB.displayName, evaluatorB.role),
  ] });
  await client.userAccountStoreAccess.createMany({ data: [
    { accountId: evaluatorA.accountId, storeId: "store-live" },
    { accountId: evaluatorB.accountId, storeId: "store-live" },
  ] });
  await client.employee.create({ data: { id: "employee-live", storeId: "store-live", displayName: "HandoverEmployee006", employmentType: "PartTime", employeeType: "REGULAR" } });
  await client.employee.createMany({ data: [
    { id: "employee-double", storeId: "store-live", displayName: "Double Submit", employmentType: "PartTime", employeeType: "REGULAR" },
    { id: "employee-race", storeId: "store-live", displayName: "Close Race", employmentType: "PartTime", employeeType: "REGULAR" },
  ] });
  await client.skillDefinition.create({ data: { id: "skill-opening", code: "opening-live", nameZh: "开早", nameEn: "Opening", category: "OPERATIONS", skillMode: "BINARY", weight: 1, displayOrder: 1 } });
  await client.employeeSkill.create({ data: { employeeId: "employee-live", skillDefinitionId: "skill-opening", status: "CanDo", updatedBy: admin.accountId } });
}

function accountData(id: string, username: string, displayName: string, role: "ADMIN" | "STORE_EVALUATOR") {
  return { id, username, displayName, passwordHash: "integration-test-not-used", role, isActive: true } as const;
}

function actor(accountId: string, displayName: string, role: "ADMIN" | "STORE_EVALUATOR", storeIds: string[]): AuthContext {
  return { accountId, userId: accountId, username: accountId, displayName, role, storeIds, canAccessAllStores: role === "ADMIN" };
}

async function submission(client: PrismaClient, roundId: string, speedRating: 1 | 2 | 3 | 4 | 5, openingStatus: "CanDo" | "CannotDo" = "CanDo") {
  const round = await client.evaluationRound.findUniqueOrThrow({ where: { id: roundId }, select: { skillBaselineSnapshot: true } });
  const baseline = round.skillBaselineSnapshot as Array<{ skillDefinitionId: string; skillMode: "PROGRESSIVE" | "BINARY" }>;
  return {
    speedRating,
    initiativeRating: 4 as const,
    attitudeRating: 4 as const,
    availabilityRating: 4 as const,
    textFeedback: "",
    skills: baseline.map((skill) => ({ skillDefinitionId: skill.skillDefinitionId, status: skill.skillMode === "BINARY" ? openingStatus : "Independent" as const })),
  };
}
