import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const statePath = join(tmpdir(), "molly-roster-calendar-name-browser.json");
const command = process.argv[2];
const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required.");
const parsed = new URL(rootUrl);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/molly_roster") {
  throw new Error("This fixture only runs against the local molly_roster database.");
}
if (parsed.searchParams.get("schema") && parsed.searchParams.get("schema") !== "public") throw new Error("Expected the root database connection.");

if (command === "prepare") await prepare();
else if (command === "cleanup") await cleanup();
else throw new Error("Expected prepare or cleanup.");

async function prepare() {
  if (existsSync(statePath)) throw new Error("A calendar browser fixture already exists; clean it before preparing another.");
  const schema = `codex_calendar_name_${Date.now()}_${randomBytes(2).toString("hex")}`;
  assertSchema(schema);
  const isolated = new URL(rootUrl!);
  isolated.searchParams.set("schema", schema);
  const isolatedUrl = isolated.toString();
  const rootDb = new PrismaClient({ datasourceUrl: rootUrl });
  try {
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    try {
      execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolatedUrl }, stdio: "pipe", timeout: 90_000,
      });
      const db = new PrismaClient({ datasourceUrl: isolatedUrl });
      try {
        await seed(db);
      } finally {
        await db.$disconnect();
      }
      await writeFile(statePath, JSON.stringify({ schema, isolatedUrl }), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      throw error;
    }
  } finally {
    await rootDb.$disconnect();
  }
  console.log(JSON.stringify({ prepared: true, schema, statePath, draftDate: "2026-10-09", publishedDate: "2026-10-16" }));
}

async function seed(db: PrismaClient) {
  const role = await db.shiftRole.create({ data: { code: "qa-front", nameZh: "QA Front", colorToken: "#2563eb", requiredSkillCodes: [], displayOrder: 1 } });
  const draft = await db.rosterPeriod.create({ data: { id: "qa-draft-period", storeId: "browser-store", startDate: new Date("2026-10-05"), endDate: new Date("2026-10-11"), cycleType: "WEEK", createdByAccountId: "qa-admin" } });
  const publishedAt = new Date("2026-10-08T00:00:00.000Z");
  const published = await db.rosterPeriod.create({ data: { id: "qa-published-period", storeId: "browser-store", startDate: new Date("2026-10-12"), endDate: new Date("2026-10-18"), cycleType: "WEEK", status: "PUBLISHED", publishedAt, createdByAccountId: "qa-admin" } });
  for (const [period, date, startAt, endAt] of [
    [draft, "2026-10-09", "2026-10-08T22:00:00.000Z", "2026-10-09T02:00:00.000Z"],
    [published, "2026-10-16", "2026-10-15T22:00:00.000Z", "2026-10-16T02:00:00.000Z"],
  ] as const) {
    await db.shift.create({ data: {
      id: period.id === draft.id ? "qa-draft-shift" : "qa-published-shift", rosterPeriodId: period.id, storeId: "browser-store", date: new Date(date),
      startAt: new Date(startAt), endAt: new Date(endAt), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
        employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime",
      } },
    } });
  }
  // A second draft record with the exact calendar group key exercises the
  // grouped-shift picker without changing either saved employee snapshot.
  await db.shift.create({ data: {
    id: "qa-draft-grouped-shift", rosterPeriodId: draft.id, storeId: "browser-store", date: new Date("2026-10-09"),
    startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
      employeeId: "browser-training", employeeNameSnapshot: "Training Alice", employeeTypeSnapshot: "TRAINING", employmentTypeSnapshot: "PartTime",
    } },
  } });
  const publishedShift = await db.shift.findUniqueOrThrow({ where: { id: "qa-published-shift" }, include: { assignments: true } });
  const snapshot = {
    schemaVersion: 1, store: { id: "browser-store", name: "Browser Acceptance" },
    period: { id: published.id, storeId: published.storeId, startDate: "2026-10-12", endDate: "2026-10-18", cycleType: "WEEK", status: "PUBLISHED", version: published.version },
    publishedBy: { accountId: "qa-admin", displayName: "QA Admin" },
    shifts: [{ id: publishedShift.id, rosterPeriodId: published.id, storeId: "browser-store", date: "2026-10-16", startAt: publishedShift.startAt.toISOString(), endAt: publishedShift.endAt.toISOString(), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, publicNote: null, assignments: publishedShift.assignments.map((row) => ({ id: row.id, employeeId: row.employeeId, employeeNameSnapshot: row.employeeNameSnapshot, employeeTypeSnapshot: row.employeeTypeSnapshot, employmentTypeSnapshot: row.employmentTypeSnapshot, officialScoreSnapshot: null, tierSnapshot: null })) }],
  };
  await db.rosterPublication.create({ data: { rosterPeriodId: published.id, periodVersion: published.version, publishedByAccountId: "qa-admin", publishedAt, snapshot } });
}

async function cleanup() {
  const state = JSON.parse(await readFile(statePath, "utf8")) as { schema: string; isolatedUrl: string };
  assertSchema(state.schema);
  const isolated = new URL(state.isolatedUrl);
  if (isolated.hostname !== parsed.hostname || isolated.port !== parsed.port || isolated.pathname !== parsed.pathname || isolated.searchParams.get("schema") !== state.schema) {
    throw new Error("Fixture state does not match the configured local database.");
  }
  const rootDb = new PrismaClient({ datasourceUrl: rootUrl });
  try {
    await rootDb.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
  } finally {
    await rootDb.$disconnect();
  }
  await rm(statePath);
  console.log(JSON.stringify({ cleaned: true, schema: state.schema }));
}

function assertSchema(value: string) {
  if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(value)) throw new Error("Unsafe fixture schema name.");
}
