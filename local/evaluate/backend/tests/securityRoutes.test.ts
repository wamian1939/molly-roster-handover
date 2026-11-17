import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationRouter } from "../src/routes.js";

function appWith(options: { catalogService?: object; authService?: object; loginRateLimitService?: object } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api", createEvaluationRouter(
    options.catalogService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.authService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.loginRateLimitService as never,
  ));
  return app;
}

describe("basic API security boundaries", () => {
  it("does not expose a production hard-delete Store endpoint, including force variants", async () => {
    const app = appWith();
    await request(app).delete("/api/stores/store-1").expect(404);
    await request(app).delete("/api/stores/store-1?force=1").expect(404);
  });

  it("returns a generic 500 while retaining the real exception in the server log", async () => {
    const realError = new Error("Prisma connection secret detail");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = appWith({
      catalogService: {
        listStores: vi.fn(async () => { throw realError; }),
        listPeriods: vi.fn(async () => []),
      },
    });

    const response = await request(app).get("/api/stores").expect(500);

    expect(response.body).toEqual({ message: "服务器发生错误，请稍后重试" });
    expect(JSON.stringify(response.body)).not.toContain("Prisma");
    expect(consoleError).toHaveBeenCalledWith("Unhandled API error", expect.objectContaining({
      errorName: "Error",
      errorMessage: realError.message,
    }));
    consoleError.mockRestore();
  });

  it("rate limits only after a generous number of failed login attempts", async () => {
    const invalidCredentials = Object.assign(new Error("invalid credentials"), { status: 401 });
    const authService = { login: vi.fn(async () => { throw invalidCredentials; }) };
    let attempts = 0;
    const loginRateLimitService = { reserve: vi.fn(async () => ++attempts > 10 ? 900 : 0), clear: vi.fn() };
    const app = appWith({ authService, loginRateLimitService });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post("/api/auth/login").send({ username: "pilot", password: "wrong" }).expect(401);
    }
    const response = await request(app).post("/api/auth/login").send({ username: "pilot", password: "wrong" }).expect(429);

    expect(response.headers["retry-after"]).toBeDefined();
    expect(authService.login).toHaveBeenCalledTimes(10);
    expect(loginRateLimitService.reserve).toHaveBeenCalledTimes(11);
  });

  it("clears the shared reservation after a valid login", async () => {
    const loginRateLimitService = { reserve: vi.fn(async () => 0), clear: vi.fn(async () => undefined) };
    const authService = { login: vi.fn(async () => ({
      token: "disposable-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "account-1", role: "ADMIN" },
    })) };
    const app = appWith({ authService, loginRateLimitService });

    await request(app).post("/api/auth/login").send({ username: "Pilot", password: "valid" }).expect(200);
    expect(loginRateLimitService.clear).toHaveBeenCalledWith(expect.any(String), "Pilot");
  });
});
