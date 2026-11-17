import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("production app shell", () => {
  let frontendDistPath: string;

  beforeEach(async () => {
    frontendDistPath = await mkdtemp(join(tmpdir(), "evaluate-molly-dist-"));
    await mkdir(join(frontendDistPath, "assets"));
    await writeFile(join(frontendDistPath, "index.html"), "<!doctype html><title>Evaluate Molly</title><div id=\"root\"></div>");
    await writeFile(join(frontendDistPath, "assets", "app.js"), "console.log('app')");
  });

  afterEach(async () => {
    await rm(frontendDistPath, { recursive: true, force: true });
  });

  it("serves health, static assets, and React deep links without swallowing API 404s", async () => {
    const app = createApp({
      production: true,
      frontendDistPath,
      appOrigin: "https://evaluate-molly.onrender.com",
      healthCheck: async () => undefined,
    });

    await request(app).get("/api/health").expect(200, { ok: true }).expect("Cache-Control", "no-store, private")
      .expect("Cross-Origin-Resource-Policy", "same-origin")
      .expect("Content-Security-Policy", /default-src 'self'/);
    await request(app).get("/api/auth/me").set("x-user-role", "ADMIN").expect(200).expect("Cache-Control", "no-store, private");
    await request(app).get("/assets/app.js").expect(200).expect("Cache-Control", /immutable/)
      .expect("Cross-Origin-Resource-Policy", "same-origin")
      .expect("Content-Security-Policy", /script-src 'self'/);
    for (const path of [
      "/",
      "/login",
      "/evaluations",
      "/employees/employee-1",
      "/evaluations/v1/evaluation-1",
      "/skill-board",
      "/accounts",
      "/stores",
    ]) {
      await request(app).get(path).set("Accept", "text/html").expect(200).expect(/Evaluate Molly/);
    }
    await request(app).get("/api/not-real").set("Accept", "text/html").expect(404, { message: "API endpoint not found." }).expect("Cache-Control", "no-store, private");
  });

  it("accepts production mutations only from the configured same origin", async () => {
    const app = createApp({
      production: true,
      frontendDistPath,
      appOrigin: "https://evaluate-molly.onrender.com",
      healthCheck: async () => undefined,
    });

    await request(app).post("/api/auth/logout").expect(403, { message: "请求来源不受信任" });
    await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://different.example")
      .expect(403, { message: "请求来源不受信任" });
  });
});
