import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unexpected disposable schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Fixture must use isolated local Roster schema");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [period, publications, shifts] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.findMany({ where: { rosterPeriodId: "qa-published-period" }, orderBy: { periodVersion: "asc" } }),
    db.shift.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  if (period.status !== "PUBLISHED" || period.version !== 3 || shifts !== 1 || publications.length !== 2
    || publications[0].periodVersion !== 1 || publications[1].periodVersion !== 3) {
    throw new Error("Reopen/Publish did not preserve expected period and publication history");
  }
  console.log(JSON.stringify({ verified: true, periodVersion: period.version, status: period.status,
    publicationVersions: publications.map((item) => item.periodVersion), shifts }));
} finally {
  await db.$disconnect();
}
