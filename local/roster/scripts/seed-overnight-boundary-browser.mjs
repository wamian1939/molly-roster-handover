import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const draft = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
  const published = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } });
  if (draft.storeId !== "browser-store" || draft.status !== "DRAFT" || published.storeId !== "browser-store"
    || published.status !== "PUBLISHED" || await db.shift.count({ where: { id: "qa-overnight-boundary-shift" } })) {
    throw new Error("Disposable fixture does not match the expected baseline");
  }
  const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
  await db.shift.create({ data: {
    id: "qa-overnight-boundary-shift", rosterPeriodId: draft.id, storeId: "browser-store", date: new Date("2026-10-11"),
    startAt: new Date("2026-10-11T12:00:00.000Z"), endAt: new Date("2026-10-11T15:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
      employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime",
    } },
  } });
  console.log(JSON.stringify({ seeded: true, shiftId: "qa-overnight-boundary-shift", schema: state.schema }));
} finally {
  await db.$disconnect();
}
