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
  const draft = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
  if (draft.storeId !== "browser-store") throw new Error("Unexpected fixture period");
  if (command === "seed" || command === "seed-legacy-store") {
    if (draft.status !== "DRAFT" || draft.version !== 1) throw new Error("Expected untouched draft");
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
    const legacyStore = command === "seed-legacy-store";
    await db.shift.create({ data: { id: "qa-misplaced-shift", rosterPeriodId: draft.id,
      storeId: legacyStore ? "browser-other-store" : "browser-store",
      date: new Date(legacyStore ? "2026-10-10" : "2026-10-12"),
      startAt: new Date(legacyStore ? "2026-10-09T22:00:00.000Z" : "2026-10-11T22:00:00.000Z"),
      endAt: new Date(legacyStore ? "2026-10-10T02:00:00.000Z" : "2026-10-12T02:00:00.000Z"),
      breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
      assignments: { create: { employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR" } } } });
    console.log(JSON.stringify({ seeded: true, shiftId: "qa-misplaced-shift", scenario: legacyStore ? "legacy-store" : "outside-period-date" }));
  } else if (command === "verify") {
    const [misplaced, currentDraft, published, publicationCount, targetCount, shiftCount] = await Promise.all([
      db.shift.findUniqueOrThrow({ where: { id: "qa-misplaced-shift" } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: draft.id } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
      db.rosterPublication.count({ where: { rosterPeriodId: draft.id } }),
      db.rosterPeriod.count({ where: { storeId: "browser-store", startDate: { in: [new Date("2026-10-19"), new Date("2026-10-26")] } } }),
      db.shift.count({ where: { rosterPeriodId: draft.id } }),
    ]);
    const malformed = misplaced.storeId !== draft.storeId || misplaced.date < draft.startDate || misplaced.date > draft.endDate;
    if (!malformed || misplaced.version !== 1 || currentDraft.status !== "DRAFT"
      || currentDraft.version !== 1 || published.version !== 1 || publicationCount !== 0 || targetCount !== 0 || shiftCount !== 3) {
      throw new Error("Rejected Publish/Copy changed fixture data");
    }
    console.log(JSON.stringify({ verified: true, draftVersion: currentDraft.version, draftPublicationCount: publicationCount,
      sourceShiftCount: shiftCount, targetPeriodCount: targetCount, publishedVersion: published.version }));
  } else throw new Error("Expected seed, seed-legacy-store or verify");
} finally {
  await db.$disconnect();
}
