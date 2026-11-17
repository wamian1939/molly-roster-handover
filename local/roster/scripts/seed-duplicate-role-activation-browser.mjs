import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireRoster = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireRoster("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Unsafe disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (await db.shiftRole.count({ where: { id: "qa-inactive-duplicate" } })) throw new Error("Duplicate QA seed");
  await db.shiftRole.create({ data: { id: "qa-inactive-duplicate", storeId: "browser-store",
    code: "qa-front", nameZh: "QA Front", colorToken: "#7c3aed", isActive: false } });
  console.log(JSON.stringify({ seeded: true, roleId: "qa-inactive-duplicate" }));
} finally {
  await db.$disconnect();
}
