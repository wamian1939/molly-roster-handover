import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const employee = {
  id: "emp-1",
  storeId: "store-1",
  storeName: "Downtown",
  name: "Molly Carter",
  role: "Shift Lead",
  employmentType: "Full-time",
  tenure: "3y 4m",
  status: "Active",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  evaluationCount: 1,
};

const note = {
  id: "note-1",
  employeeId: "emp-1",
  employeeName: "Molly Carter",
  employeeStatus: "Active",
  storeId: "store-1",
  storeName: "Downtown",
  authorId: "manager-1",
  noteDate: "2026-06-12T00:00:00.000Z",
  noteType: "Positive",
  dimensions: ["initiative"],
  scoreImpact: 5,
  noteText: "Handled a rush calmly.",
  createdAt: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-06-12T00:00:00.000Z",
};

function createCatalogService() {
  return {
    listPeriods: vi.fn(async () => []),
    listStores: vi.fn(async () => []),
  };
}

function createEmployeeService(overrides = {}) {
  return {
    listEmployees: vi.fn(async () => ({ items: [employee], page: 1, pageSize: 25, total: 1, totalPages: 1 })),
    getEmployee: vi.fn(async () => employee),
    createEmployee: vi.fn(async () => employee),
    updateEmployee: vi.fn(async () => employee),
    archiveEmployee: vi.fn(async () => employee),
    restoreEmployee: vi.fn(async () => employee),
    ...overrides,
  };
}

function createPerformanceNoteService() {
  return {
    listPerformanceNotes: vi.fn(async () => ({ items: [note], page: 1, pageSize: 25, total: 1, totalPages: 1 })),
    getPerformanceNotesForEmployee: vi.fn(async () => ({ items: [note], page: 1, pageSize: 25, total: 1, totalPages: 1 })),
    createPerformanceNote: vi.fn(async () => note),
  };
}

function createApp(employeeService = createEmployeeService()) {
  const catalogService = createCatalogService();
  const performanceNoteService = createPerformanceNoteService();
  const storeService = { assertActiveStore: vi.fn(async () => undefined) };
  const app = express();
  app.use(express.json());
  app.use("/api", createEvaluationRouter(catalogService as never, employeeService as never, performanceNoteService as never, storeService as never));
  return { app, performanceNoteService };
}

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

const payload = {
  employeeId: "emp-1",
  storeId: "store-1",
  noteDate: "2026-06-12T00:00:00.000Z",
  noteType: "Positive",
  dimensions: ["initiative"],
  scoreImpact: 5,
  noteText: "Handled a rush calmly.",
};

describe("performance note routes", () => {
  it("lists notes with filters and scoped store access", async () => {
    const { app, performanceNoteService } = createApp();

    await request(app)
      .get("/api/performance-notes?storeId=store-1&noteType=Positive&dimension=initiative&page=2&pageSize=10")
      .set(storeManagerStoreOne)
      .expect(200);

    expect(performanceNoteService.listPerformanceNotes).toHaveBeenCalledWith({
      storeId: "store-1",
      noteType: "Positive",
      dimension: "initiative",
      page: 2,
      pageSize: 10,
      accessibleStoreIds: ["store-1"],
    });
  });

  it("lists employee notes after checking employee store access", async () => {
    const { app, performanceNoteService } = createApp();

    await request(app).get("/api/employees/emp-1/performance-notes").set(storeManagerStoreOne).expect(200);

    expect(performanceNoteService.getPerformanceNotesForEmployee).toHaveBeenCalledWith("emp-1", {
      employeeId: "emp-1",
      accessibleStoreIds: ["store-1"],
    });
  });

  it("creates notes with author id from auth context", async () => {
    const { app, performanceNoteService } = createApp();

    await request(app).post("/api/performance-notes").set(storeManagerStoreOne).send(payload).expect(201);

    expect(performanceNoteService.createPerformanceNote).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "emp-1",
        storeId: "store-1",
        noteType: "Positive",
        dimensions: ["initiative"],
        scoreImpact: 5,
        noteText: "Handled a rush calmly.",
      }),
      "manager-1",
    );
  });

  it("rejects inaccessible store reads and writes", async () => {
    const { app, performanceNoteService } = createApp();

    await request(app).get("/api/performance-notes?storeId=store-1").set(storeManagerStoreTwo).expect(403);
    await request(app).get("/api/employees/emp-1/performance-notes").set(storeManagerStoreTwo).expect(403);
    await request(app).post("/api/performance-notes").set(storeManagerStoreTwo).send(payload).expect(403);

    expect(performanceNoteService.listPerformanceNotes).not.toHaveBeenCalled();
    expect(performanceNoteService.getPerformanceNotesForEmployee).not.toHaveBeenCalled();
    expect(performanceNoteService.createPerformanceNote).not.toHaveBeenCalled();
  });
});
