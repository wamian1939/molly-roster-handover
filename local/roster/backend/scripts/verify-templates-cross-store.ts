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
  const [source, target, shifts, publications] = await Promise.all([
    db.shiftTemplate.findMany({ where: { storeId: "browser-store" } }),
    db.shiftTemplate.findMany({ where: { storeId: "browser-other-store" } }),
    db.shift.count(), db.rosterPublication.count(),
  ]);
  if (source.length !== 1 || source[0]?.name !== "QA A Early" || source[0]?.version !== 1 ||
    target.length !== 1 || target[0]?.name !== "QA B Changed" || target[0]?.version !== 2 ||
    shifts !== 3 || publications !== 1) throw new Error("Cross-store template or fixture state changed unexpectedly");
  console.log(JSON.stringify({ verified: true, sourceName: source[0].name, sourceVersion: source[0].version,
    targetName: target[0].name, targetVersion: target[0].version, shifts, publications }));
} finally { await db.$disconnect(); }
