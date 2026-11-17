import "dotenv/config";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as { schema: string; isolatedUrl: string };
const rootUrl = process.env.DATABASE_URL;
if (!rootUrl || !/^codex_browser_acceptance_[0-9]+$/.test(state.schema)) throw new Error("Unsafe browser fixture state.");
const root = new URL(rootUrl);
const isolated = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(root.hostname) || root.pathname !== "/evaluate_molly"
  || isolated.hostname !== root.hostname || isolated.port !== root.port || isolated.pathname !== root.pathname
  || isolated.searchParams.get("schema") !== state.schema) throw new Error("Browser fixture is not in the local development database.");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [success, failure, sessions] = await Promise.all([
    db.authAuditEvent.count({ where: { eventType: "LOGIN_SUCCESS" } }),
    db.authAuditEvent.count({ where: { eventType: "LOGIN_FAILURE" } }),
    db.authSession.count(),
  ]);
  console.log(JSON.stringify({ loginSuccess: success, loginFailure: failure, sessions }));
} finally {
  await db.$disconnect();
}
