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
  const [settings, availability] = await Promise.all([
    db.rosterStoreSettings.count({ where: { storeId: "browser-store" } }),
    db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" } }),
  ]);
  if (settings || availability) throw new Error("Unexpected disposable fixture baseline");
  await db.rosterStoreSettings.create({ data: {
    storeId: "browser-store", timezone: "Australia/Sydney", weekStartsOn: 0,
    openingTime: "10:00", closingTime: "22:00", defaultBreakMinutes: 0,
  } });
  console.log(JSON.stringify({ seeded: true, storeId: "browser-store", weekStartsOn: 0, availability }));
} finally {
  await db.$disconnect();
}
