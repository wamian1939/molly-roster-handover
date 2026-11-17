import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Expected disposable Roster schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the isolated local Roster database");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [period, role, shiftCount, publicationCount] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } }),
    db.shift.count(),
    db.rosterPublication.count(),
  ]);
  if (period.storeId !== "browser-store" || period.status !== "DRAFT" || shiftCount !== 3 || publicationCount !== 1) {
    throw new Error("Disposable Calendar fixture baseline differs");
  }

  const examples = [
    { suffix: "long", startAt: "2026-10-09T23:00:00.000Z", endAt: "2026-10-10T11:00:00.000Z", employeeId: "browser-HandoverEmployee006", name: "HandoverEmployee006", role: "front", breakMinutes: 60 },
    { suffix: "early", startAt: "2026-10-09T23:00:00.000Z", endAt: "2026-10-10T06:00:00.000Z", employeeId: "browser-cindy", name: "Cindy", role: "front", breakMinutes: 30 },
    { suffix: "middle", startAt: "2026-10-10T00:00:00.000Z", endAt: "2026-10-10T06:00:00.000Z", employeeId: "browser-HandoverEmployee019", name: "HandoverEmployee019", role: "other", breakMinutes: 0 },
    { suffix: "late-second", startAt: "2026-10-10T06:00:00.000Z", endAt: "2026-10-10T11:00:00.000Z", employeeId: "browser-evan", name: "Evan", role: "other", breakMinutes: 0 },
    { suffix: "late-third", startAt: "2026-10-10T06:00:00.000Z", endAt: "2026-10-10T11:00:00.000Z", employeeId: "browser-fiona", name: "Fiona", role: "front", breakMinutes: 0 },
  ] as const;

  const otherRole = await db.shiftRole.create({ data: { code: "qa-other", nameZh: "QA Other", colorToken: "#16803d", requiredSkillCodes: [], displayOrder: 2 } });
  await db.$transaction(examples.map((example) => db.shift.create({ data: {
    id: `qa-bhs-day-${example.suffix}`, rosterPeriodId: period.id, storeId: "browser-store",
    date: new Date("2026-10-10"), startAt: new Date(example.startAt), endAt: new Date(example.endAt),
    breakMinutes: example.breakMinutes,
    shiftRoleId: example.role === "front" ? role.id : otherRole.id,
    roleNameSnapshot: example.role === "front" ? role.nameZh : otherRole.nameZh,
    roleColorSnapshot: example.role === "front" ? role.colorToken : otherRole.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: example.employeeId, employeeNameSnapshot: example.name,
      employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime" } },
  } })));
  console.log(JSON.stringify({ schema: state.schema, seeded: examples.length, localDate: "2026-10-10", shiftCount: 8 }));
} finally {
  await db.$disconnect();
}
