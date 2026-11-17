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
  const globalRole = await db.shiftRole.findFirstOrThrow({ where: { storeId: null, code: "qa-front" } });
  const storeRole = await db.shiftRole.create({ data: {
    storeId: "browser-store", code: "qa-front", nameZh: "Local QA Front", colorToken: "#0f766e",
    requiredSkillCodes: [], isActive: true, displayOrder: 1,
  } });
  console.log(JSON.stringify({ globalRoleId: globalRole.id, storeRoleId: storeRole.id }));
} finally {
  await db.$disconnect();
}
