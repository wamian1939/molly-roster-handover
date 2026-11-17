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
  if (await db.rosterPeriod.count({ where: { id: "qa-archive-period" } })) throw new Error("Archive fixture already exists");
  const period = await db.rosterPeriod.create({ data: {
    id: "qa-archive-period", storeId: "browser-store", startDate: new Date("2025-10-13"), endDate: new Date("2025-10-19"),
    cycleType: "WEEK", status: "PUBLISHED", version: 1, publishedAt: new Date("2025-10-12T00:00:00.000Z"), createdByAccountId: "qa-admin",
  } });
  const snapshot = {
    schemaVersion: 1, timezone: "Australia/Sydney", store: { id: "browser-store", name: "Browser Acceptance" },
    period: { id: period.id, storeId: period.storeId, startDate: "2025-10-13", endDate: "2025-10-19", cycleType: "WEEK", status: "PUBLISHED", version: 1 },
    publishedBy: { accountId: "qa-admin", displayName: "QA Admin" }, shifts: [],
  };
  const publication = await db.rosterPublication.create({ data: {
    rosterPeriodId: period.id, periodVersion: 1, publishedByAccountId: "qa-admin", publishedAt: new Date("2025-10-12T00:00:00.000Z"), snapshot,
  } });
  console.log(JSON.stringify({ seeded: true, schema: fixture.schema, periodId: period.id, publicationId: publication.id }));
} finally {
  await db.$disconnect();
}
