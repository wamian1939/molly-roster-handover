import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import "dotenv/config";
import { PrismaClient, type SkillStatus } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

const statePath = join(tmpdir(), "evaluate-molly-browser-acceptance.json");
const command = process.argv[2];
const acceptanceEmployees = [
  { id: "browser-training", storeId: "browser-store", displayName: "Training Alice", employmentType: "PartTime", employeeType: "TRAINING" },
  { id: "browser-regular", storeId: "browser-store", displayName: "Regular Bob", employmentType: "FullTime", employeeType: "REGULAR" },
  { id: "browser-HandoverEmployee006", storeId: "browser-store", displayName: "HandoverEmployee006", employmentType: "FullTime", employeeType: "REGULAR" },
  { id: "browser-cindy", storeId: "browser-store", displayName: "Cindy", employmentType: "PartTime", employeeType: "REGULAR" },
  { id: "browser-HandoverEmployee019", storeId: "browser-store", displayName: "HandoverEmployee019", employmentType: "Casual", employeeType: "REGULAR" },
  { id: "browser-evan", storeId: "browser-store", displayName: "Evan", employmentType: "FullTime", employeeType: "REGULAR" },
  { id: "browser-fiona", storeId: "browser-store", displayName: "Fiona", employmentType: "PartTime", employeeType: "TRAINING" },
  { id: "browser-grace", storeId: "browser-store", displayName: "Grace", employmentType: "Casual", employeeType: "TRAINING" },
  { id: "browser-henry", storeId: "browser-store", displayName: "Henry", employmentType: "FullTime", employeeType: "REGULAR" },
  { id: "browser-ivy", storeId: "browser-store", displayName: "Ivy", employmentType: "PartTime", employeeType: "TRAINING" },
  { id: "browser-other-employee", storeId: "browser-other-store", displayName: "Other Store Employee", employmentType: "FullTime", employeeType: "REGULAR" },
] as const;

if (command === "prepare") await prepare();
else if (command === "cleanup") await cleanup();
else throw new Error("Expected prepare or cleanup command.");

async function prepare() {
  const rootUrl = process.env.DATABASE_URL;
  if (!rootUrl) throw new Error("DATABASE_URL is required.");

  const schema = `codex_browser_acceptance_${Date.now()}`;
  assertSafeSchema(schema);
  const isolated = new URL(rootUrl);
  isolated.searchParams.set("schema", schema);
  const isolatedUrl = isolated.toString();
  const rootDb = new PrismaClient({ datasourceUrl: rootUrl });

  try {
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: isolatedUrl },
      stdio: "pipe",
      timeout: 90_000,
    });

    const db = new PrismaClient({ datasourceUrl: isolatedUrl });
    try {
      const credentials = await seedAcceptanceData(db);
      await writeFile(statePath, JSON.stringify({ schema, isolatedUrl, credentials }), { encoding: "utf8", mode: 0o600 });
    } finally {
      await db.$disconnect();
    }
  } catch (error) {
    await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    throw error;
  } finally {
    await rootDb.$disconnect();
  }

  console.log(JSON.stringify({ prepared: true, schema, statePath, storeId: "browser-store", employeeIds: acceptanceEmployees.filter((employee) => employee.storeId === "browser-store").map((employee) => employee.id) }));
}

async function cleanup() {
  const rootUrl = process.env.DATABASE_URL;
  if (!rootUrl) throw new Error("DATABASE_URL is required.");
  const state = JSON.parse(await readFile(statePath, "utf8")) as { schema: string };
  assertSafeSchema(state.schema);
  const rootDb = new PrismaClient({ datasourceUrl: rootUrl });
  try {
    await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${state.schema}" CASCADE`);
  } finally {
    await rootDb.$disconnect();
  }
  await rm(statePath, { force: true });
  console.log(JSON.stringify({ cleaned: true, schema: state.schema }));
}

async function seedAcceptanceData(db: PrismaClient) {
  await db.store.create({ data: { id: "browser-store", name: "Browser Acceptance", region: "Sydney", managerName: "QA Manager", city: "Sydney" } });
  await db.store.create({ data: { id: "browser-other-store", name: "Other Store", region: "Sydney", managerName: "Other Manager", city: "Sydney" } });

  const skillData = [
    ["tea-preparation", "开茶", "Tea Preparation", "BackKitchen", "PROGRESSIVE", 1.5],
    ["milk-bar", "奶吧", "Milk Bar", "BackKitchen", "PROGRESSIVE", 1.5],
    ["cup-labeling", "贴杯", "Cup Labeling", "Bar", "PROGRESSIVE", 0.7],
    ["code-scanning", "扫码", "Code Scanning", "Bar", "PROGRESSIVE", 0.7],
    ["ice-adding", "加冰", "Ice Adding", "Bar", "PROGRESSIVE", 0.8],
    ["cup-spinning", "炫杯", "Cup Spinning", "Bar", "PROGRESSIVE", 1],
    ["transfer-station", "中转", "Transfer Station", "Front", "PROGRESSIVE", 1.1],
    ["delivery-packing", "外卖打包", "Delivery Packing", "Front", "PROGRESSIVE", 0.8],
    ["drink-dispatch", "出杯", "Drink Dispatch", "Front", "PROGRESSIVE", 1],
    ["order-taking", "点单", "Order Taking", "Front", "PROGRESSIVE", 1.4],
    ["opening", "开早", "Opening", "Operations", "BINARY", 1],
    ["closing", "收晚", "Closing", "Operations", "BINARY", 1],
    ["weekly-cleaning", "周清", "Weekly Cleaning", "Operations", "BINARY", 1],
  ] as const;

  for (const [index, [code, nameZh, nameEn, category, skillMode, weight]] of skillData.entries()) {
    const definition = { nameZh, nameEn, category, skillMode, weight, displayOrder: (index + 1) * 10, isActive: true };
    await db.skillDefinition.upsert({
      where: { code },
      update: definition,
      create: { id: `browser-skill-${index + 1}`, code, ...definition },
    });
  }

  await db.employee.createMany({ data: acceptanceEmployees });

  const accountSpecs = [
    { id: "browser-admin", username: "browser-admin", displayName: "Browser Admin", role: "ADMIN" as const, storeId: null },
    { id: "browser-evaluator-a", username: "browser-evaluator-a", displayName: "Evaluator A", role: "STORE_EVALUATOR" as const, storeId: "browser-store" },
    { id: "browser-evaluator-b", username: "browser-evaluator-b", displayName: "Evaluator B", role: "STORE_EVALUATOR" as const, storeId: "browser-store" },
    { id: "browser-evaluator-c", username: "browser-evaluator-c", displayName: "Evaluator C", role: "STORE_EVALUATOR" as const, storeId: "browser-store" },
    { id: "browser-evaluator-other", username: "browser-evaluator-other", displayName: "Other Evaluator", role: "STORE_EVALUATOR" as const, storeId: "browser-other-store" },
  ];
  const credentials: Record<string, { username: string; password: string }> = {};
  for (const account of accountSpecs) {
    const password = randomBytes(18).toString("base64url");
    credentials[account.id] = { username: account.username, password };
    await db.userAccount.create({ data: {
      id: account.id, username: account.username, displayName: account.displayName,
      role: account.role, passwordHash: await hashPassword(password), isActive: true,
      ...(account.storeId ? { storeAccesses: { create: { storeId: account.storeId } } } : {}),
    } });
  }

  const definitions = await db.skillDefinition.findMany({ select: { id: true, skillMode: true } });
  const employees = acceptanceEmployees.map((employee) => employee.id);
  await db.employeeSkill.createMany({
    data: employees.flatMap((employeeId) => definitions.map((definition) => ({
      employeeId,
      skillDefinitionId: definition.id,
      status: (definition.skillMode === "BINARY" ? "CanDo" : "Independent") as SkillStatus,
      updatedBy: "browser-admin",
    }))),
  });
  return credentials;
}

function assertSafeSchema(schema: string) {
  if (!/^codex_browser_acceptance_[0-9]+$/.test(schema)) throw new Error("Unsafe browser-acceptance schema name.");
}
