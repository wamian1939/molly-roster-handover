import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

const adminHeaders = { "x-user-id": "admin-1", "x-user-role": "ADMIN" };
const evaluatorHeaders = { "x-user-id": "manager-1", "x-user-role": "STORE_EVALUATOR", "x-store-ids": "store-1,store-2" };

function setup() {
  const accountService = {
    listAccounts: vi.fn(async () => []),
    createAccount: vi.fn(async (payload) => ({ id: "account-1", ...payload })),
    updateAccount: vi.fn(async (_id, payload) => ({ id: "account-1", ...payload })),
    deleteAccount: vi.fn(async () => ({ ok: true })),
    resetPassword: vi.fn(async () => ({ ok: true })),
  };
  const app = express();
  app.use(express.json());
  app.use("/api", createEvaluationRouter(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, accountService as never));
  return { app, accountService };
}

describe("account management routes", () => {
  it("returns the multi-store auth/me contract", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/auth/me").set(evaluatorHeaders).expect(200);
    expect(response.body.user).toMatchObject({
      id: "manager-1",
      role: "STORE_EVALUATOR",
      storeIds: ["store-1", "store-2"],
      stores: [{ id: "store-1", name: "store-1" }, { id: "store-2", name: "store-2" }],
      canAccessAllStores: false,
    });
  });

  it("accepts multiple Store IDs and exposes the safe delete endpoint only to ADMIN", async () => {
    const { app, accountService } = setup();
    const payload = { username: "regional.manager", displayName: "Regional", password: "password1", role: "STORE_EVALUATOR", storeIds: ["store-1", "store-2"] };
    await request(app).post("/api/admin/accounts").set(adminHeaders).send(payload).expect(201);
    expect(accountService.createAccount).toHaveBeenCalledWith(payload, "admin-1");
    await request(app).delete("/api/admin/accounts/account-1").set(evaluatorHeaders).expect(403);
    await request(app).delete("/api/admin/accounts/account-1").set(adminHeaders).expect(200, { ok: true });
    expect(accountService.deleteAccount).toHaveBeenCalledWith("account-1", "admin-1");
  });

  it("rejects legacy single-store account payloads", async () => {
    const { app, accountService } = setup();
    await request(app).post("/api/admin/accounts").set(adminHeaders).send({ username: "legacy", displayName: "Legacy", password: "password1", role: "STORE_EVALUATOR", storeId: "store-1" }).expect(400);
    expect(accountService.createAccount).not.toHaveBeenCalled();
  });
});
