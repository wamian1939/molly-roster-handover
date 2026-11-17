import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(readFileSync(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema) || process.env.DATABASE_URL !== fixture.isolatedUrl) {
  throw new Error("Refusing to seed outside the guarded disposable browser schema");
}

const db = new PrismaClient();
try {
  const role = await db.shiftRole.findFirstOrThrow({ where: { storeId: "browser-store", code: "qa-role", nameZh: "验收岗" } });
  await db.shiftTemplate.create({ data: {
    id: "qa-legacy-role-template", storeId: "browser-store", name: "旧岗位模板",
    startTime: "09:00", endTime: "17:00", breakMinutes: 30, shiftRoleId: role.id,
  } });
  await db.shift.create({ data: {
    id: "qa-legacy-role-shift", rosterPeriodId: "qa-draft-period", storeId: "browser-store",
    date: new Date("2026-10-09"), startAt: new Date("2026-10-09T02:00:00.000Z"), endAt: new Date("2026-10-09T03:00:00.000Z"),
    breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime" } },
  } });
  console.log(JSON.stringify({ created: true, templateId: "qa-legacy-role-template", shiftId: "qa-legacy-role-shift" }));
} finally {
  await db.$disconnect();
}
