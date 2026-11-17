import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const auth = {
  "x-user-id": "manager-1",
  "x-user-role": "StoreManager",
  "x-store-ids": "store-1",
};

function setup() {
  const rosterSkillBoardService = {
    getBoard: vi.fn(async () => ({ stores: [], skillDefinitions: [], employees: [] })),
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createEvaluationRouter(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      rosterSkillBoardService as never,
    ),
  );
  return { app, rosterSkillBoardService };
}

describe("Roster Skill Board API routes", () => {
  it("passes accessible store scope to the board service", async () => {
    const { app, rosterSkillBoardService } = setup();

    await request(app)
      .get("/api/roster-skill-board?storeId=store-1")
      .set(auth)
      .expect(200);

    expect(rosterSkillBoardService.getBoard).toHaveBeenCalledWith(["store-1"], "store-1", expect.objectContaining({ accountId: "manager-1" }));
  });

  it("rejects unauthorized store filters before loading data", async () => {
    const { app, rosterSkillBoardService } = setup();

    await request(app)
      .get("/api/roster-skill-board?storeId=store-2")
      .set(auth)
      .expect(403);

    expect(rosterSkillBoardService.getBoard).not.toHaveBeenCalled();
  });
});
