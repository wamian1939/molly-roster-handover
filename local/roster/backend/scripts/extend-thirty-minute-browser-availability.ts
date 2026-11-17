import "dotenv/config";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
    url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const current = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" } });
  if (current.length !== 1 || current[0].status !== "AVAILABLE" ||
      current[0].startAt?.toISOString() !== "2026-10-08T22:00:00.000Z" ||
      current[0].endAt?.toISOString() !== "2026-10-08T23:00:00.000Z") {
    throw new Error("Disposable availability baseline differs; nothing changed");
  }
  await new RosterService(db).replaceAvailability({
    storeId: "browser-store", employeeId: "browser-HandoverEmployee006", dates: ["2026-10-09"], entries: [
      { date: "2026-10-09", status: "AVAILABLE", startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-08T23:00:00.000Z" },
      { date: "2026-10-09", status: "AVAILABLE", startAt: "2026-10-09T02:00:00.000Z", endAt: "2026-10-09T03:00:00.000Z" },
    ],
  });
  console.log(JSON.stringify({ prepared: true, schema: state.schema, addedAvailability: "13:00-14:00" }));
} finally {
  await db.$disconnect();
}
