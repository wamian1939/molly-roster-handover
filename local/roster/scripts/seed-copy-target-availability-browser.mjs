import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const source = await db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } });
  if (source.storeId !== "browser-store" || source.date.toISOString().slice(0, 10) !== "2026-10-09"
    || await db.employeeAvailability.count({ where: { storeId: "browser-store" } })) throw new Error("Unexpected disposable copy fixture");
  await db.employeeAvailability.createMany({ data: [
    { storeId: "browser-store", employeeId: "browser-regular", date: new Date("2026-10-09"), status: "AVAILABLE", startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T06:00:00.000Z") },
    { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-10"), status: "AVAILABLE", startAt: new Date("2026-10-09T22:00:00.000Z"), endAt: new Date("2026-10-10T06:00:00.000Z") },
  ] });
  console.log(JSON.stringify({ seeded: true, schema: fixture.schema, sourceDate: "2026-10-09", targetDate: "2026-10-10" }));
} finally {
  await db.$disconnect();
}
