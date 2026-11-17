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
  const role = await db.$transaction(async (transaction) => {
    const nextRole = await transaction.shiftRole.create({ data: {
      storeId: "browser-store", code: "qa-role-repair", nameZh: "验收岗", colorToken: "#B45309",
      requiredSkillCodes: [], isActive: true, displayOrder: 50,
    } });
    const changed = await transaction.shift.updateMany({ where: {
      id: "qa-draft-shift", storeId: "browser-store", version: 1,
    }, data: { shiftRoleId: nextRole.id, roleNameSnapshot: nextRole.nameZh, roleColorSnapshot: nextRole.colorToken } });
    if (changed.count !== 1) throw new Error("Expected exactly one disposable draft Shift");
    return nextRole;
  });
  console.log(JSON.stringify({ seeded: true, legacyRoleId: role.id, shiftId: "qa-draft-shift" }));
} finally {
  await db.$disconnect();
}
