import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe QA schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Unsafe QA database URL");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [total, fixture, publications] = await Promise.all([
    db.shift.count(),
    db.shift.count({ where: { id: { startsWith: "qa-bhs-day-" } } }),
    db.rosterPublication.count(),
  ]);
  if (total !== 8 || fixture !== 5 || publications !== 1) throw new Error("Unexpected disposable Day fixture");
  const removed = await db.shift.deleteMany({ where: {
    id: { in: ["qa-bhs-day-early", "qa-bhs-day-middle", "qa-bhs-day-late-second", "qa-bhs-day-late-third"] },
  } });
  if (removed.count !== 4 || await db.shift.count() !== 4 || await db.rosterPublication.count() !== 1) {
    throw new Error("Disposable overlap reduction failed");
  }
  console.log(JSON.stringify({ removed: removed.count, remainingShifts: 4, publications: 1 }));
} finally {
  await db.$disconnect();
}
