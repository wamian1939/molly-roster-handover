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
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, assignments, publications, draft, published, legacyRole] = await Promise.all([
    db.shift.count(), db.shiftAssignment.count(), db.rosterPublication.count(),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" }, select: { version: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, select: { version: true } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null }, select: { isActive: true } }),
  ]);
  if (shifts !== 3 || assignments !== 3 || publications !== 1 || draft.version !== 1
    || published.version !== 1 || !legacyRole.isActive) {
    throw new Error("Disposable role-filter fixture changed during browser-only interaction checks");
  }
  console.log(JSON.stringify({ schema: fixture.schema, shifts, assignments, publications,
    draftVersion: draft.version, publishedVersion: published.version }));
} finally {
  await db.$disconnect();
}
