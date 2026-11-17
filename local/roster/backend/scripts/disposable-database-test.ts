import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const statePath = join(tmpdir(), "molly-roster-backend-database-test.json");
const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required");
const root = new URL(rootUrl);
if (!["localhost", "127.0.0.1"].includes(root.hostname) || root.port !== "5433" || root.pathname !== "/molly_roster"
  || (root.searchParams.get("schema") && root.searchParams.get("schema") !== "public")) {
  throw new Error("Only the local molly_roster root database is allowed");
}
const command = process.argv[2];
if (command === "prepare") await prepare();
else if (command === "cleanup") await cleanup();
else throw new Error("Expected prepare or cleanup");

async function prepare() {
  try {
    await readFile(statePath, "utf8");
    throw new Error("An isolated backend test schema already exists; clean it first");
  } catch (cause) {
    if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ENOENT") throw cause;
  }
  const schema = `codex_roster_backend_test_${Date.now()}_${randomBytes(2).toString("hex")}`;
  assertSchema(schema);
  const isolated = new URL(rootUrl!);
  isolated.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: rootUrl });
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    try {
      execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: "pipe", timeout: 120_000,
      });
      await writeFile(statePath, JSON.stringify({ schema, isolatedUrl: isolated.toString() }), { encoding: "utf8", mode: 0o600 });
    } catch (cause) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      throw cause;
    }
  } finally { await db.$disconnect(); }
  console.log(JSON.stringify({ prepared: true, schema }));
}

async function cleanup() {
  const state = JSON.parse(await readFile(statePath, "utf8")) as { schema: string; isolatedUrl: string };
  assertSchema(state.schema);
  const isolated = new URL(state.isolatedUrl);
  if (isolated.hostname !== root.hostname || isolated.port !== root.port || isolated.pathname !== root.pathname
    || isolated.searchParams.get("schema") !== state.schema) throw new Error("Fixture state does not match the local root database");
  const db = new PrismaClient({ datasourceUrl: rootUrl });
  try { await db.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`); }
  finally { await db.$disconnect(); }
  await rm(statePath);
  console.log(JSON.stringify({ cleaned: true, schema: state.schema }));
}

function assertSchema(schema: string) {
  if (!/^codex_roster_backend_test_[0-9]+_[0-9a-f]{4}$/.test(schema)) throw new Error("Unsafe schema name");
}
