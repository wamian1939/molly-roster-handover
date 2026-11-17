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
  const shift = await db.shift.findUniqueOrThrow({ where: { id: "qa-draft-grouped-shift" } });
  if (process.argv[2] === "verify") {
    const [period, publication, original] = await Promise.all([
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.rosterPublication.count(),
      db.shift.findUnique({ where: { id: "qa-draft-shift" } }),
    ]);
    if (shift.date.toISOString() !== "2026-10-10T00:00:00.000Z" || shift.version !== 2
      || period.version !== 3 || original || publication !== 1) throw new Error("Moved Shift or publication state did not persist");
    console.log(JSON.stringify({ verified: true, shiftId: shift.id, date: "2026-10-10", shiftVersion: 2,
      periodVersion: period.version, originalDeleted: true, publicationCount: publication }));
    process.exitCode = 0;
  } else if (process.argv[2] === "move") {
  if (shift.storeId !== "browser-store" || shift.rosterPeriodId !== "qa-draft-period" || shift.version !== 1
    || shift.date.toISOString() !== "2026-10-09T00:00:00.000Z") throw new Error("Unexpected source Shift state");
  await db.$transaction(async (transaction) => {
    await transaction.shift.update({ where: { id: shift.id, version: 1 }, data: {
      date: new Date("2026-10-10T00:00:00.000Z"), startAt: new Date("2026-10-09T22:00:00.000Z"),
      endAt: new Date("2026-10-10T02:00:00.000Z"), version: { increment: 1 },
    } });
    await transaction.rosterPeriod.update({ where: { id: shift.rosterPeriodId }, data: { version: { increment: 1 } } });
  });
  console.log(JSON.stringify({ moved: shift.id, date: "2026-10-10", version: 2 }));
  } else throw new Error("Expected move or verify");
} finally {
  await db.$disconnect();
}
