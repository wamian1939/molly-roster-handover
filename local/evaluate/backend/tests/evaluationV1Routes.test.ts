import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const auth = { "x-user-id": "manager-1", "x-user-role": "StoreManager", "x-store-ids": "store-1" };
const payload = { speedRating: 4, initiativeRating: 5, attitudeRating: 4, availabilityRating: 3, textFeedback: "表现稳定", skills: [{ skillDefinitionId: "skill-1", status: "Proficient" }] };

function setup() {
  const v1Service = {
    startLiveScoring: vi.fn(async () => ({ roundId: "round-1", status: "Unsubmitted" })),
    getLiveScoringContext: vi.fn(async () => ({ roundId: "round-1", status: "Unsubmitted" })),
    previewLiveSubmission: vi.fn(async () => ({ overallScore: 82, tier: "T2" })),
    previewLiveSkills: vi.fn(async () => ({ componentScore: 60, skillCategories: {} })),
    analyzeLiveText: vi.fn(async () => ({ textScore: 7 })),
    submitLiveEvaluation: vi.fn(async () => ({ id: "eval-1", status: "Submitted", overallScore: 82 })),
    getMyEvaluation: vi.fn(async () => null), getStoreId: vi.fn(async () => "store-1"), getEvaluation: vi.fn(async () => ({ id: "eval-1" })),
  };
  const employeeService = { getEmployee: vi.fn(async () => ({ id: "emp-1", storeId: "store-1" })) };
  const storeService = { assertActiveStore: vi.fn(async () => undefined) };
  const app = express(); app.use(express.json());
  app.use("/api", createEvaluationRouter(undefined, employeeService as never, undefined, storeService as never, v1Service as never));
  return { app, v1Service };
}

describe("live Evaluation V1 routes", () => {
  it("has no Draft creation route", async () => {
    const { app, v1Service } = setup();
    await request(app).post("/api/evaluations/v1/drafts").set(auth).send({ employeeId: "emp-1" }).expect(404);
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
  });

  it("opens a scoring context without submitting", async () => {
    const { app, v1Service } = setup();
    await request(app).post("/api/employees/emp-1/scoring-context").set(auth).expect(200);
    expect(v1Service.startLiveScoring).toHaveBeenCalledOnce();
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
  });

  it("previews without persistence and submits explicitly with PUT", async () => {
    const { app, v1Service } = setup();
    await request(app).post("/api/evaluation-rounds/round-1/preview-my-evaluation").set(auth).send(payload).expect(200);
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
    await request(app).put("/api/evaluation-rounds/round-1/my-evaluation").set(auth).send(payload).expect(200);
    expect(v1Service.submitLiveEvaluation).toHaveBeenCalledWith("round-1", payload, expect.objectContaining({ accountId: "manager-1" }));
  });

  it("previews partial skill input without persistence", async () => {
    const { app, v1Service } = setup();
    const skills = [{ skillDefinitionId: "skill-1", status: "Unknown" }];
    await request(app).post("/api/evaluation-rounds/round-1/preview-my-skills").set(auth).send({ skills }).expect(200);
    expect(v1Service.previewLiveSkills).toHaveBeenCalledWith("round-1", { skills }, expect.objectContaining({ accountId: "manager-1" }));
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
  });

  it.each([0, 6, 2.5])("rejects invalid rating %s before the service", async (rating) => {
    const { app, v1Service } = setup();
    await request(app).put("/api/evaluation-rounds/round-1/my-evaluation").set(auth).send({ ...payload, speedRating: rating }).expect(400);
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
  });

  it("rejects client-computed scores", async () => {
    const { app, v1Service } = setup();
    await request(app).put("/api/evaluation-rounds/round-1/my-evaluation").set(auth).send({ ...payload, overallScore: 100 }).expect(400);
    expect(v1Service.submitLiveEvaluation).not.toHaveBeenCalled();
  });
});
