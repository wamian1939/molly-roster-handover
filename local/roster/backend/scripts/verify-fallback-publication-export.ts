import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [period, shift, publication, allPublications] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-fallback-period" } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-fallback-copy-source" }, include: { assignments: true } }),
    db.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: "qa-fallback-period" } }),
    db.rosterPublication.count(),
  ]);
  const snapshot = publication.snapshot;
  if (period.status !== "DRAFT" || period.version !== 1 || shift.version !== 1 || shift.assignments.length !== 1
    || shift.startAt.toISOString() !== "2026-04-04T15:30:00.000Z"
    || shift.endAt.toISOString() !== "2026-04-04T16:30:00.000Z"
    || allPublications !== 2 || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
    || snapshot.timezone !== "Australia/Sydney") throw new Error("Fallback export fixture was changed");
  console.log(JSON.stringify({ verified: true, schema: fixture.schema, shiftVersion: shift.version,
    periodVersion: period.version, publications: allPublications, snapshotTimezone: snapshot.timezone }));
} finally {
  await db.$disconnect();
}
