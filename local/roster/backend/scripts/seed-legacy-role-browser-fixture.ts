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
  const role = await db.shiftRole.create({ data: { storeId: "browser-store", code: "qa-role", nameZh: "验收岗", colorToken: "#B45309", requiredSkillCodes: [], isActive: true, displayOrder: 50 } });
  console.log(JSON.stringify({ id: role.id, code: role.code }));
} finally {
  await db.$disconnect();
}
