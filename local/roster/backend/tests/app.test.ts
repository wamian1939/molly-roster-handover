import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("application foundation", () => {
  it("reports unhealthy until both database and Evaluate are connected", async () => {
    const evaluate = { health: vi.fn(async () => false) };
    const app = createApp({ evaluate: evaluate as never, databaseHealth: vi.fn(async () => true) });
    const response = await request(app).get("/api/health").expect(503).expect("Cache-Control", "no-store, private");
    expect(response.body).toEqual({ ok: false, services: { database: true, evaluateMolly: false } });
  });

  it("reports ready only when both dependencies are healthy", async () => {
    const evaluate = { health: vi.fn(async () => true) };
    const app = createApp({ evaluate: evaluate as never, databaseHealth: vi.fn(async () => true) });
    await request(app).get("/api/health").expect(200, { ok: true, services: { database: true, evaluateMolly: true } }).expect("Cache-Control", "no-store, private");
    await request(app).get("/api/session").set("x-test-user-role", "ADMIN").expect(200, { ok: true }).expect("Cache-Control", "no-store, private");
  });

  it("sanitizes unknown backend errors", async () => {
    const evaluate = { health: vi.fn(async () => true) };
    const app = createApp({ evaluate: evaluate as never, databaseHealth: vi.fn(async () => { throw new Error("DATABASE_URL=secret"); }) });
    const response = await request(app).get("/api/health").expect(503);
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});

