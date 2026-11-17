import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createEmployeeDemoRouter } from "../src/employeeDemoRoutes.js";
import { HttpError } from "../src/httpError.js";

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "molly-employee-demo-")); temporary.push(folder);
  const file = join(folder, "reports.json");
  let version = "test:v1";
  const app = express(); app.use(express.json());
  app.use("/demo", createEmployeeDemoRouter({ file, rules: async () => ({
    storeId: "hurstville", timezone: "Australia/Sydney", version, scope: "DEFAULT",
    weekly: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), [{ start: "10:00", end: "12:00", staff: 2 }]])),
  }), shortcuts: async () => ({ version: 1, shortcuts: [{ code: "AA", startTime: "10:00", endTime: "12:00" }, { code: "BB", startTime: "10:00", endTime: "11:00" }, { code: "CC", startTime: "11:00", endTime: "12:00" }] }) }));
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 500).json({ message: error.message });
  }; app.use(handler);
  async function login(id: string) {
    const response = await request(app).post("/demo/login").send({ accountId: id }).expect(200);
    return response.headers["set-cookie"][0].split(";")[0] as string;
  }
  async function week(cookie: string) { return (await request(app).get("/demo/week?week=2026-11-09").set("Cookie", cookie).expect(200)).body; }
  function payload(value: Awaited<ReturnType<typeof week>>) {
    return { expectedAccountId: value.accountId, week: value.week, expectedRevision: value.revision, ruleVersion: value.ruleVersion,
      days: value.days.map((d: { date: string }) => ({ date: d.date, status: "AVAILABLE", shortcut: "AA", slots: [{ start: "10:00", end: "12:00" }] })) };
  }
  return { app, file, login, week, payload, changeRules: () => { version = "test:v2"; } };
}

describe("mock employee reporting boundary", () => {
  it("reuses the existing weekday-code parser for lowercase, joined expressions and ranges", async () => {
    const f = await fixture(), cookie = await f.login("demo-1");
    const preview = async (script: string) => request(f.app).post("/demo/preview").set("Cookie", cookie).send({ expectedAccountId: "demo-1", week: "2026-11-09", script });
    const response = await preview("1aa2bb3cc"); expect(response.status).toBe(200);
    expect(response.body.days.slice(0, 3)).toMatchObject([
      { shortcut: "AA", slots: [{ start: "10:00", end: "12:00" }] },
      { shortcut: "BB", slots: [{ start: "10:00", end: "11:00" }] },
      { shortcut: "CC", slots: [{ start: "11:00", end: "12:00" }] },
    ]);
    expect(response.body.days[3]).toMatchObject({ status: "UNKNOWN", slots: [] });
    expect((await preview("1-5AA")).body.days.filter((d: { status: string }) => d.status === "AVAILABLE")).toHaveLength(5);
    expect((await preview("1AA1BB")).status).toBe(400);
    expect((await preview("1ZZ")).status).toBe(400);
    expect((await preview("another employee\t1AA")).status).toBe(400);
    expect((await f.week(cookie)).revision).toBe(0);
  });
  it("rejects a manual interval that disagrees with the selected store code", async () => {
    const f = await fixture(), cookie = await f.login("demo-1"), value = await f.week(cookie);
    const payload = f.payload(value); payload.days[0].slots[0].end = "11:00";
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(payload).expect(400);
    expect((await f.week(cookie)).revision).toBe(0);
  });
  it("requires its own session and rejects another employee identity or arbitrary input", async () => {
    const f = await fixture();
    await request(f.app).get("/demo/week?week=2026-11-09").expect(401);
    await request(f.app).post("/demo/login").send({ accountId: "real-employee" }).expect(400);
    const cookie = await f.login("demo-1"), value = await f.week(cookie);
    await request(f.app).put("/demo/week").set("Cookie", cookie).send({ ...f.payload(value), expectedAccountId: "demo-2" }).expect(409);
    await request(f.app).put("/demo/week").set("Cookie", cookie).send({ ...f.payload(value), employeeId: "demo-2" }).expect(400);
    const other = await f.login("demo-2"); expect((await f.week(other)).revision).toBe(0);
  });
  it("persists separate reports, returns only colors, permits red submissions and counts edits once", async () => {
    const f = await fixture();
    for (const id of ["demo-1", "demo-2", "demo-3"]) {
      const cookie = await f.login(id), value = await f.week(cookie);
      const saved = (await request(f.app).put("/demo/week").set("Cookie", cookie).send(f.payload(value)).expect(200)).body;
      expect(saved.capacity[0].bands[0].signal).toBe(id === "demo-1" ? "GREEN" : id === "demo-2" ? "YELLOW" : "RED");
      expect(saved.capacity[0].bands[0]).toEqual({ start: "10:00", end: "12:00", signal: saved.capacity[0].bands[0].signal });
      await request(f.app).put("/demo/week").set("Cookie", cookie).send(f.payload(saved)).expect(200);
    }
    expect(Object.keys(JSON.parse(await readFile(f.file, "utf8")))).toHaveLength(3);
    const cookie = await f.login("demo-1"), value = await f.week(cookie);
    const cleared = { ...f.payload(value), days: value.days.map((d: { date: string }) => ({ date: d.date, status: "UNAVAILABLE", slots: [] })) };
    const saved = (await request(f.app).put("/demo/week").set("Cookie", cookie).send(cleared).expect(200)).body;
    expect(saved.capacity[0].bands[0].signal).toBe("YELLOW");
  });
  it("preserves records on stale versions, stale rules, duplicate dates and overlapping slots", async () => {
    const f = await fixture(), cookie = await f.login("demo-1"), value = await f.week(cookie);
    const payload = f.payload(value);
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(payload).expect(200);
    const before = await readFile(f.file, "utf8");
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(payload).expect(409);
    const current = await f.week(cookie);
    const duplicate = f.payload(current); duplicate.days[1].date = duplicate.days[0].date;
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(duplicate).expect(400);
    const overlap = f.payload(current); overlap.days[0].slots.push({ start: "10:30", end: "11:30" });
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(overlap).expect(400);
    f.changeRules();
    await request(f.app).put("/demo/week").set("Cookie", cookie).send(f.payload(current)).expect(409);
    expect(await readFile(f.file, "utf8")).toBe(before);
  });
  it("serializes concurrent saves so a stale tab cannot overwrite the winner", async () => {
    const f = await fixture(), cookie = await f.login("demo-1"), value = await f.week(cookie);
    const outcomes = await Promise.all([1, 2].map(() => request(f.app).put("/demo/week").set("Cookie", cookie).send(f.payload(value))));
    expect(outcomes.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await f.week(cookie)).revision).toBe(1);
    await request(f.app).post("/demo/logout").set("Cookie", cookie).expect(200);
    await request(f.app).get("/demo/week?week=2026-11-09").set("Cookie", cookie).expect(401);
  });
});
