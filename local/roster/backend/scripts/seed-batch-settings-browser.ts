import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) || url.searchParams.get("schema") !== state.schema
  || url.port !== "5433" || url.pathname !== "/molly_roster" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Expected guarded disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const command = process.argv[2];
  if (command === "seed") {
    const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
    if (period.storeId !== "browser-store" || period.status !== "DRAFT" || period.version !== 1) throw new Error("Unexpected fixture period");
    for (const employeeId of ["browser-regular", "browser-training"]) {
      await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId, date: new Date("2026-10-09"), status: "AVAILABLE",
        startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z") } });
    }
    await db.rosterStoreSettings.create({ data: { storeId: "browser-store", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", minimumShiftMinutes: 300 } });
    await db.shiftRole.create({ data: { storeId: "browser-store", code: "qa-batch-settings-target", nameZh: "QA Batch Target", colorToken: "#7c3aed" } });
    console.log(JSON.stringify({ seeded: true, minimumShiftMinutes: 300, shiftCount: 2 }));
  } else if (command === "verify") {
    const [source, grouped, draft, published, publicationCount, shiftCount] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" } }),
      db.shift.findUniqueOrThrow({ where: { id: "qa-draft-grouped-shift" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
      db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
      db.shift.count({ where: { storeId: "browser-store" } }),
    ]);
    if (source.version !== 1 || grouped.version !== 1 || source.roleNameSnapshot !== "QA Front" || grouped.roleNameSnapshot !== "QA Front"
      || draft.version !== 1 || draft.status !== "DRAFT" || published.version !== 1 || publicationCount !== 1 || shiftCount !== 3) {
      throw new Error("Rejected batch changed Shift, period, or publication state");
    }
    console.log(JSON.stringify({ verified: true, sourceVersion: source.version, groupedVersion: grouped.version,
      draftVersion: draft.version, publishedVersion: published.version, publicationCount, shiftCount }));
  } else throw new Error("Expected seed or verify");
} finally {
  await db.$disconnect();
}
