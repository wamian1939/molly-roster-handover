import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe disposable schema");
const url = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unexpected database target");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, periods, publications, source, target] = await Promise.all([
    db.shift.count(), db.rosterPeriod.count(), db.rosterPublication.count(),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shift.count({ where: { date: { in: [new Date("2026-10-10"), new Date("2026-10-11")] } } }),
  ]);
  if (shifts !== 3 || periods !== 2 || publications !== 1 || source.version !== 1 || target !== 0) throw new Error("Copy Day preview changed fixture data");
  console.log(JSON.stringify({ verified: true, shifts, periods, publications, sourceVersion: source.version, targetShifts: target }));
} finally {
  await db.$disconnect();
}
