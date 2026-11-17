import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const employee = {
  id: "emp-1",
  storeId: "store-1",
  storeName: "Downtown",
  displayName: "Molly Carter",
  employmentType: "Full-time",
  employeeType: "REGULAR",
  employmentCommencementDate: "2023-01-01",
  tenureMonths: 40,
  status: "Active",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  evaluationCount: 1,
  jobs: [],
};

function createCatalogService() {
  return {
    listPeriods: vi.fn(async () => []),
    listStores: vi.fn(async () => []),
  };
}

function createEmployeeService() {
  return {
    listEmployees: vi.fn(async () => ({
      items: [employee],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    })),
    getEmployee: vi.fn(async () => employee),
    getEmployeeProfile: vi.fn(async () => ({ ...employee, taxFileNumber: "123456789" })),
    createEmployee: vi.fn(async () => employee),
    updateEmployee: vi.fn(async () => ({ ...employee, displayName: "HandoverEmployee003" })),
    promoteToRegular: vi.fn(async () => ({ ...employee, employeeType: "REGULAR" })),
    archiveEmployee: vi.fn(async () => ({
      ...employee,
      status: "Archived",
      archivedAt: "2026-06-01T00:00:00.000Z",
    })),
    restoreEmployee: vi.fn(async () => employee),
  };
}

function createApp() {
  const catalogService = createCatalogService();
  const employeeService = createEmployeeService();
  const summaryService = {
    getSummary: vi.fn(async () => ({ employee, currentSkills: [], history: [] })),
  };
  const storeService = { assertActiveStore: vi.fn(async () => undefined) };
  const storeJobService = {
    list: vi.fn(async () => [{ id: "job-1", storeId: "store-1", name: "全岗", colorToken: "teal", displayOrder: 10, isActive: true }]),
    create: vi.fn(async (storeId, input) => ({ id: "job-new", storeId, ...input, isActive: true })),
    getStoreId: vi.fn(async () => "store-1"),
    update: vi.fn(async (_id, input) => ({ id: "job-1", storeId: "store-1", name: "全岗", colorToken: "teal", displayOrder: 10, isActive: input.isActive ?? true })),
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createEvaluationRouter(
      catalogService as never,
      employeeService as never,
      undefined,
      storeService as never,
      undefined,
      summaryService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      storeJobService as never,
    ),
  );
  return { app, employeeService, summaryService, storeJobService };
}

const payload = {
  storeId: "store-1",
  displayName: "Molly Carter",
  employmentType: "Full-time",
  employeeType: "REGULAR",
  status: "Active",
};

const storeManagerStoreOne = {
  "x-user-id": "manager-1",
  "x-user-role": "StoreManager",
  "x-store-ids": "store-1",
};

const storeManagerStoreTwo = {
  "x-user-id": "manager-2",
  "x-user-role": "StoreManager",
  "x-store-ids": "store-2",
};

describe("employee API routes", () => {
  let setup: ReturnType<typeof createApp>;

  beforeEach(() => {
    setup = createApp();
  });

  it("lists employees with parsed query filters", async () => {
    const response = await request(setup.app)
      .get(
        "/api/employees?storeId=store-1&page=2&pageSize=10&search=molly&employmentType=Full-time&status=Active",
      )
      .expect(200);

    expect(setup.employeeService.listEmployees).toHaveBeenCalledWith({
      storeId: "store-1",
      page: 2,
      pageSize: 10,
      search: "molly",
      evaluatorAccountId: "test-admin",
      employmentType: "Full-time",
      status: "Active",
    });
    expect(response.body).toMatchObject({
      items: [employee],
      total: 1,
      totalPages: 1,
    });
  });

  it("returns the employee evaluation summary only within the caller's store scope", async () => {
    await request(setup.app)
      .get("/api/employees/emp-1/evaluation-summary")
      .set(storeManagerStoreOne)
      .expect(200);
    expect(setup.summaryService.getSummary).toHaveBeenCalledWith("emp-1", ["store-1"], expect.objectContaining({ accountId: "manager-1" }));

    await request(setup.app)
      .get("/api/employees/emp-1/evaluation-summary")
      .set(storeManagerStoreTwo)
      .expect(403);
  });

  it("lists employees for a store route", async () => {
    await request(setup.app).get("/api/stores/store-1/employees?status=Archived").expect(200);

    expect(setup.employeeService.listEmployees).toHaveBeenCalledWith({
      storeId: "store-1",
      status: "Archived",
      evaluatorAccountId: "test-admin",
    });
  });

  it("scopes employee list to assigned stores for store managers", async () => {
    await request(setup.app).get("/api/employees").set(storeManagerStoreOne).expect(200);

    expect(setup.employeeService.listEmployees).toHaveBeenCalledWith({
      accessibleStoreIds: ["store-1"],
      evaluatorAccountId: "manager-1",
    });
  });

  it("allows store managers to access assigned store employees", async () => {
    await request(setup.app).get("/api/stores/store-1/employees").set(storeManagerStoreOne).expect(200);

    expect(setup.employeeService.listEmployees).toHaveBeenCalledWith({
      storeId: "store-1",
      accessibleStoreIds: ["store-1"],
      evaluatorAccountId: "manager-1",
    });
  });

  it("blocks store managers from unassigned employee stores", async () => {
    const response = await request(setup.app)
      .get("/api/stores/store-2/employees")
      .set(storeManagerStoreOne)
      .expect(403);

    expect(response.body.message).toBe("无权访问该门店");
    expect(setup.employeeService.listEmployees).not.toHaveBeenCalled();
  });

  it("gets, creates, updates, archives, and restores employees", async () => {
    await request(setup.app).get("/api/employees/emp-1").expect(200);
    await request(setup.app).post("/api/employees").send(payload).expect(201);
    await request(setup.app).put("/api/employees/emp-1").send({ displayName: "HandoverEmployee003" }).expect(200);
    await request(setup.app).post("/api/employees/emp-1/archive").expect(200);
    await request(setup.app).post("/api/employees/emp-1/restore").expect(200);

    expect(setup.employeeService.getEmployee).toHaveBeenCalledWith("emp-1");
    expect(setup.employeeService.createEmployee).toHaveBeenCalledWith({ ...payload, employeeType: "REGULAR", jobIds: [] }, "test-admin");
    expect(setup.employeeService.updateEmployee).toHaveBeenCalledWith("emp-1", { displayName: "HandoverEmployee003" }, "test-admin");
    expect(setup.employeeService.archiveEmployee).toHaveBeenCalledWith("emp-1");
    expect(setup.employeeService.restoreEmployee).toHaveBeenCalledWith("emp-1");
  });

  it("blocks employee mutations for inaccessible stores", async () => {
    await request(setup.app).post("/api/employees").set(storeManagerStoreTwo).send(payload).expect(403);
    await request(setup.app).put("/api/employees/emp-1").set(storeManagerStoreTwo).send({ displayName: "Blocked" }).expect(403);
    await request(setup.app).post("/api/employees/emp-1/archive").set(storeManagerStoreTwo).expect(403);
    await request(setup.app).post("/api/employees/emp-1/restore").set(storeManagerStoreTwo).expect(403);

    expect(setup.employeeService.createEmployee).not.toHaveBeenCalled();
    expect(setup.employeeService.updateEmployee).not.toHaveBeenCalled();
    expect(setup.employeeService.archiveEmployee).not.toHaveBeenCalled();
    expect(setup.employeeService.restoreEmployee).not.toHaveBeenCalled();
  });

  it("blocks moving an employee into an inaccessible store", async () => {
    await request(setup.app)
      .put("/api/employees/emp-1")
      .set(storeManagerStoreOne)
      .send({ storeId: "store-2" })
      .expect(403);

    expect(setup.employeeService.updateEmployee).not.toHaveBeenCalled();
  });

  it("rejects invalid employee payloads", async () => {
    await request(setup.app).post("/api/employees").send({}).expect(400);
    await request(setup.app).get("/api/employees?page=0").expect(400);
  });

  it("keeps the full HR profile admin-only", async () => {
    const adminProfile = await request(setup.app).get("/api/employees/emp-1/profile").expect(200);
    expect(adminProfile.headers["cache-control"]).toContain("no-store");
    await request(setup.app).get("/api/employees/emp-1/profile").set(storeManagerStoreOne).expect(403);
    expect(setup.employeeService.getEmployeeProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps operational employee DTOs free of sensitive HR fields", async () => {
    const response = await request(setup.app).get("/api/employees").set(storeManagerStoreOne).expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(/taxFileNumber|bankAccount|bsbNumber|dateOfBirth|addressLine|mobileTelephoneNumber|emailAddress|visaType|superannuation/i);
  });

  it("promotes a Training employee through an ADMIN-only endpoint", async () => {
    await request(setup.app).post("/api/employees/emp-1/promote-to-regular").expect(200);
    await request(setup.app).post("/api/employees/emp-1/promote-to-regular").set(storeManagerStoreOne).expect(403);
    expect(setup.employeeService.promoteToRegular).toHaveBeenCalledOnce();
    expect(setup.employeeService.promoteToRegular).toHaveBeenCalledWith("emp-1");
  });

  it("rejects removed position, qualification, and duplicate shop fields", async () => {
    await request(setup.app).post("/api/employees").send({ ...payload, role: "Staff" }).expect(400);
    await request(setup.app).post("/api/employees").send({ ...payload, whichShop: "Hurstville" }).expect(400);
    await request(setup.app).put("/api/employees/emp-1").send({ openingQualified: true }).expect(400);
  });

  it("lists Store jobs to authorized evaluators but reserves job mutation for ADMIN", async () => {
    const listed = await request(setup.app).get("/api/store-jobs?storeId=store-1").set(storeManagerStoreOne).expect(200);
    expect(listed.body[0]).toMatchObject({ name: "全岗", storeId: "store-1" });
    await request(setup.app).post("/api/stores/store-1/jobs").set(storeManagerStoreOne).send({ name: "值班负责人", colorToken: "teal", displayOrder: 30 }).expect(403);
    await request(setup.app).post("/api/stores/store-1/jobs").send({ name: "值班负责人", colorToken: "teal", displayOrder: 30 }).expect(201);
    expect(setup.storeJobService.create).toHaveBeenCalledWith("store-1", expect.objectContaining({ name: "值班负责人" }));
  });
});
