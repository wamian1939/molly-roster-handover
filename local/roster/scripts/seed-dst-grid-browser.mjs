import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const rosterRequire = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = rosterRequire("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unsafe schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe database");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front" } });
  await db.rosterPeriod.create({ data: {
    id: "qa-dst-period", storeId: "browser-store", startDate: new Date("2026-09-28"),
    endDate: new Date("2026-10-04"), cycleType: "WEEK", createdByAccountId: "qa-admin",
  } });
  await db.shift.create({ data: {
    id: "qa-dst-shift", rosterPeriodId: "qa-dst-period", storeId: "browser-store",
    date: new Date("2026-10-04"), startAt: new Date("2026-10-03T16:30:00.000Z"),
    endAt: new Date("2026-10-03T17:30:00.000Z"), breakMinutes: 0,
    shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR" } },
  } });
  console.log(JSON.stringify({ seeded: true, schema: state.schema, shift: "qa-dst-shift" }));
} finally {
  await db.$disconnect();
}
