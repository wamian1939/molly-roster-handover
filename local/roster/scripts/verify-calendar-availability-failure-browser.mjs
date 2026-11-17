import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable schema target");

const db = new PrismaClient({ datasources: { db: { url: state.isolatedUrl } } });
try {
  const [draft, published, shifts, publications] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true } }),
    db.rosterPublication.findMany({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  if (draft.status !== "DRAFT" || draft.version !== 1 || published.status !== "PUBLISHED" || published.version !== 1
    || shifts.length !== 3 || shifts.some((shift) => shift.version !== 1) || publications.length !== 1) {
    throw new Error("Availability failure browser pass modified fixture data");
  }
  console.log(JSON.stringify({ verified: true, draftVersion: draft.version, publishedVersion: published.version,
    shiftCount: shifts.length, publicationCount: publications.length }));
} finally {
  await db.$disconnect();
}
