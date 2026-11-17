import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const managerHeaders = { "x-user-id": "manager-1", "x-user-role": "STORE_EVALUATOR", "x-store-ids": "store-1" };

function setup() {
  const integration = {
    contractVersion: vi.fn(() => ({ contractVersion: "1.1.0", generatedAt: "now" })),
    listStores: vi.fn(async () => ({ stores: [] })),
    listSkillDefinitions: vi.fn(async () => ({ contractVersion: "1.3.0", skills: [{ code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE" }] })),
    listEmployees: vi.fn(async () => ({ employees: [] })),
    getEmployee: vi.fn(async () => ({ employee: null })),
  };
  const app = express(); app.use(express.json());
  app.use("/api", createEvaluationRouter(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, integration as never));
  return { app, integration };
}

describe("Roster integration routes", () => {
  it("exposes authenticated contract metadata", async () => {
    const { app } = setup();
    await request(app).get("/api/roster-integration/contract-version").expect(200, { contractVersion: "1.1.0", generatedAt: "now" });
  });

  it("passes current evaluator store scope to employee detail without revealing an out-of-scope record", async () => {
    const { app, integration } = setup();
    await request(app).get("/api/roster-integration/employees/employee-2").set(managerHeaders).expect(404);
    expect(integration.getEmployee).toHaveBeenCalledWith("employee-2", ["store-1"]);
  });

  it("passes the evaluator store scope to list employees", async () => {
    const { app, integration } = setup();
    await request(app).get("/api/roster-integration/stores/store-1/employees").set(managerHeaders).expect(200);
    expect(integration.listEmployees).toHaveBeenCalledWith("store-1", ["store-1"], undefined, undefined);
  });

  it("exposes the non-PII skill catalog to an authenticated evaluator", async () => {
    const { app, integration } = setup();
    const result = await request(app).get("/api/roster-integration/skill-definitions").set(managerHeaders).expect(200);
    expect(result.body.skills).toEqual([{ code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE" }]);
  });

  it("validates and forwards bounded pagination", async () => {
    const { app, integration } = setup();
    await request(app).get("/api/roster-integration/stores/store-1/employees?page=2&pageSize=50").set(managerHeaders).expect(200);
    expect(integration.listEmployees).toHaveBeenCalledWith("store-1", ["store-1"], 2, 50);
    await request(app).get("/api/roster-integration/stores/store-1/employees?pageSize=1000").set(managerHeaders).expect(400);
  });

  it("rejects cross-store list access before the integration service", async () => {
    const { app, integration } = setup();
    await request(app).get("/api/roster-integration/stores/store-2/employees").set(managerHeaders).expect(403);
    expect(integration.listEmployees).not.toHaveBeenCalled();
  });
});
