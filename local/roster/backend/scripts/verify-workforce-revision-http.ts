import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { EvaluateClient } from "../src/evaluateClient.js";
import { prisma } from "../src/prisma.js";

const evaluateBase = "http://127.0.0.1:4010/api";
const rosterDatabaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!(["localhost", "127.0.0.1"].includes(rosterDatabaseUrl.hostname)
  && rosterDatabaseUrl.port === "5433" && rosterDatabaseUrl.pathname === "/molly_roster")) {
  throw new Error("Paired HTTP acceptance requires the local Roster development database.");
}

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string;
  credentials: Record<string, { username: string; password: string }>;
};
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)) {
  throw new Error("Paired HTTP acceptance requires the disposable Evaluate browser schema.");
}

class TracedEvaluateClient extends EvaluateClient {
  readonly paths: string[] = [];
  override integration(path: string, cookie: string) {
    this.paths.push(path);
    return super.integration(path, cookie);
  }
}

const evaluate = new TracedEvaluateClient(evaluateBase);
const app = createApp({ evaluate });
try {
  const health = await request(app).get("/api/health").expect(200);
  assert.deepEqual(health.body.services, { database: true, evaluateMolly: true });

  const login = await request(app).post("/api/auth/login").send(state.credentials["browser-evaluator-a"]).expect(200);
  assert.equal(login.body.user?.role, "STORE_EVALUATOR");
  const setCookie = login.headers["set-cookie"];
  const sessionCookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .find((value): value is string => typeof value === "string" && value.startsWith("evaluate_molly_session="))
    ?.split(";")[0];
  assert.ok(sessionCookie, "Expected Evaluate session cookie through Roster proxy");

  const me = await request(app).get("/api/auth/me").set("cookie", sessionCookie).expect(200);
  assert.equal(me.body.user?.role, "STORE_EVALUATOR");
  const response = await request(app).get("/api/workforce/stores/browser-store/employees").set("cookie", sessionCookie).expect(200);
  assert.equal(response.body.contractVersion, "1.4.0");
  assert.equal(response.body.employees.length, 101);
  assert.equal(new Set(response.body.employees.map((employee: { id: string }) => employee.id)).size, 101);
  assert.ok(response.body.employees.every((employee: { storeId: string; isActive: boolean }) => employee.storeId === "browser-store" && employee.isActive));
  assert.deepEqual(evaluate.paths, [
    "/stores/browser-store/employees?page=1&pageSize=100",
    "/stores/browser-store/employees?page=2&pageSize=100",
    "/stores/browser-store/employees?page=1&pageSize=1",
  ]);
  assert.doesNotMatch(JSON.stringify(response.body), /taxFileNumber|bankAccountNumber|bsbNumber|dateOfBirth|visaType|superannuationAccountNumber/i);
  const adminLogin = await request(app).post("/api/auth/login").send(state.credentials["browser-admin"]).expect(200);
  const adminSetCookie = adminLogin.headers["set-cookie"];
  const adminCookie = (Array.isArray(adminSetCookie) ? adminSetCookie : [adminSetCookie])
    .find((value): value is string => typeof value === "string" && value.startsWith("evaluate_molly_session="))
    ?.split(";")[0];
  assert.ok(adminCookie);
  const singlePage = await request(app).get("/api/workforce/stores/browser-other-store/employees").set("cookie", adminCookie).expect(200);
  assert.equal(singlePage.body.employees.length, 1);
  assert.equal(singlePage.body.employees[0].id, "browser-other-employee");
  assert.deepEqual(evaluate.paths.slice(3), [
    "/stores/browser-other-store/employees?page=1&pageSize=100",
    "/stores/browser-other-store/employees?page=1&pageSize=1",
  ]);
  console.log(JSON.stringify({ pairedHttp: true, role: me.body.user.role, contractVersion: response.body.contractVersion, employees: response.body.employees.length, multiPageRevisionChecks: 3, singlePageRevisionChecks: 2, database: health.body.services.database, evaluateMolly: health.body.services.evaluateMolly }));
} finally {
  await prisma.$disconnect();
}
