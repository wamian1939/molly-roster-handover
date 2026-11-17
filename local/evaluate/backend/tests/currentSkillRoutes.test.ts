import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const evaluator = { "x-user-id": "evaluator-1", "x-user-role": "STORE_EVALUATOR", "x-store-ids": "store-1" };
const admin = { "x-user-id": "admin-1", "x-user-role": "ADMIN" };

function setup() {
  const employeeService = { getEmployee: vi.fn(async () => ({ id: "employee-1", storeId: "store-1" })) };
  const currentSkillService = {
    listConfirmations: vi.fn(async () => ({ items: [{ id: "confirmation-1", confirmedByName: "Admin", reason: "reviewed" }], page: 1, pageSize: 5, total: 1, totalPages: 1 })),
    confirm: vi.fn(async () => []),
  };
  const app = express();
  app.use(express.json());
  app.use("/api", createEvaluationRouter(undefined, employeeService as never, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, currentSkillService as never));
  return { app, employeeService, currentSkillService };
}

describe("current skill confirmation routes", () => {
  it("returns a bounded, non-PII audit page to ADMIN", async () => {
    const { app, currentSkillService } = setup();
    const response = await request(app).get("/api/employees/employee-1/current-skills/skill-1/confirmations?page=2&pageSize=5").set(admin).expect(200);
    expect(currentSkillService.listConfirmations).toHaveBeenCalledWith("employee-1", "skill-1", 2, 5);
    expect(response.body.items[0]).toMatchObject({ id: "confirmation-1", confirmedByName: "Admin" });
    await request(app).get("/api/employees/employee-1/current-skills/skill-1/confirmations?pageSize=51").set(admin).expect(400);
  });

  it("blocks STORE_EVALUATOR before reading the employee or audit history", async () => {
    const { app, employeeService, currentSkillService } = setup();
    await request(app).get("/api/employees/employee-1/current-skills/skill-1/confirmations").set(evaluator).expect(403);
    expect(employeeService.getEmployee).not.toHaveBeenCalled();
    expect(currentSkillService.listConfirmations).not.toHaveBeenCalled();
  });

  it("requires a reason when ADMIN confirms current skill", async () => {
    const { app, currentSkillService } = setup();
    await request(app).patch("/api/employees/employee-1/current-skills/skill-1").set(admin).send({ status: "Independent", expectedUpdatedAt: null }).expect(400);
    expect(currentSkillService.confirm).not.toHaveBeenCalled();
  });
});
