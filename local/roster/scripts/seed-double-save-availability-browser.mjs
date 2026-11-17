import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe QA schema");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  if (await db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" } })) throw new Error("HandoverEmployee006 QA Availability already exists");
  await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
    date: new Date("2026-10-10T00:00:00.000Z"), status: "AVAILABLE",
    startAt: new Date("2026-10-09T22:00:00.000Z"), endAt: new Date("2026-10-10T00:00:00.000Z") } });
  console.log(JSON.stringify({ seeded: true, employeeId: "browser-HandoverEmployee006", date: "2026-10-10" }));
} finally {
  await db.$disconnect();
}
