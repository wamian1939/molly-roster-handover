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
  const [draft, reopened, shifts, publications] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPublication.findMany(),
  ]);
  if (draft.status !== "DRAFT" || draft.version !== 1
    || reopened.status !== "DRAFT" || reopened.version !== 2
    || shifts.length !== 3 || shifts.some((shift) => shift.version !== 1)
    || publications.length !== 1 || publications[0].rosterPeriodId !== reopened.id
    || publications[0].periodVersion !== 1
    || publications[0].snapshot?.period?.status !== "PUBLISHED") {
    throw new Error("Month Reopen changed the wrong period, shifts, or historical publication");
  }
  console.log(JSON.stringify({ verified: true, untouchedDraftVersion: draft.version,
    reopenedPeriodVersion: reopened.version, shifts: shifts.length,
    historicalPublicationVersion: publications[0].periodVersion, historicalStatus: "PUBLISHED" }));
} finally {
  await db.$disconnect();
}
