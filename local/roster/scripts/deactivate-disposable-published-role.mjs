import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable schema target");

const db = new PrismaClient({ datasources: { db: { url: state.isolatedUrl } } });
try {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: "qa-published-shift" }, include: { shiftRole: true } });
  if (shift.storeId !== "browser-store" || shift.shiftRole.code !== "qa-front" || shift.shiftRole.isActive !== true) {
    throw new Error("Unexpected disposable fixture state");
  }
  await db.shiftRole.update({ where: { id: shift.shiftRoleId }, data: { isActive: false } });
  console.log(JSON.stringify({ deactivated: true, shiftId: shift.id, roleCode: shift.shiftRole.code, schema: state.schema }));
} finally {
  await db.$disconnect();
}
