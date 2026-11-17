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
  const publication = await db.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: "qa-published-period" } });
  const snapshot = publication.snapshot;
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object"
    || snapshot.store?.id !== "browser-store" || snapshot.period?.id !== "qa-published-period"
    || snapshot.shifts?.length !== 1 || snapshot.shifts[0]?.id !== "qa-published-shift"
    || snapshot.timezone) throw new Error("Unexpected disposable publication shape");
  if (await db.rosterStoreSettings.count({ where: { storeId: "browser-store" } })) throw new Error("Fixture store settings already exist");
  await db.$transaction([
    db.rosterStoreSettings.create({ data: { storeId: "browser-store", timezone: "Australia/Sydney" } }),
    db.rosterPublication.update({ where: { id: publication.id }, data: { snapshot: { ...snapshot, timezone: "Australia/Adelaide" } } }),
  ]);
  console.log(JSON.stringify({ seeded: true, schema: fixture.schema, publicationId: publication.id, snapshotTimezone: "Australia/Adelaide", currentTimezone: "Australia/Sydney" }));
} finally {
  await db.$disconnect();
}
