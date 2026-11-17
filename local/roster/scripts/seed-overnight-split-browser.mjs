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
  const [draft, shiftCount, existing] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { id: "qa-night-split-shift" } }),
  ]);
  if (draft.storeId !== "browser-store" || draft.status !== "DRAFT" || draft.version !== 2 || shiftCount !== 4 || existing) {
    throw new Error("Unexpected disposable early-morning fixture baseline");
  }
  const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front", storeId: null } });
  await db.shift.create({ data: {
    id: "qa-night-split-shift", rosterPeriodId: draft.id, storeId: "browser-store", date: new Date("2026-10-09"),
    startAt: new Date("2026-10-09T11:00:00.000Z"), endAt: new Date("2026-10-09T15:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin", assignments: { create: {
      employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime",
    } },
  } });
  console.log(JSON.stringify({ seeded: true, shiftId: "qa-night-split-shift", localWindow: "2026-10-09 22:00-next-day-02:00" }));
} finally {
  await db.$disconnect();
}
