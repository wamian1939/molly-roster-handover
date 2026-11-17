import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const rosterRequire = createRequire(join(workspace, "backend", "package.json"));
const evaluateRequire = createRequire(resolve(workspace, "..", "Evaluate Molly", "backend", "package.json"));
const { PrismaClient: RosterPrisma } = rosterRequire("@prisma/client");
const { PrismaClient: EvaluatePrisma } = evaluateRequire("@prisma/client");
const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
function assertDisposable(state, pattern, port, database) {
  const url = new URL(state.isolatedUrl);
  if (!pattern.test(state.schema) || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== port
    || url.pathname !== database || url.searchParams.get("schema") !== state.schema) throw new Error("Unsafe disposable fixture");
}
assertDisposable(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "5433", "/molly_roster");
assertDisposable(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "5432", "/evaluate_molly");
const roster = new RosterPrisma({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrisma({ datasourceUrl: evaluateState.isolatedUrl });
try {
  if (await roster.shiftRole.count({ where: { storeId: "browser-store" } })
    || await evaluate.storeJobDefinition.count({ where: { storeId: "browser-store" } })) throw new Error("Unexpected populated QA fixture");
  await evaluate.storeJobDefinition.create({ data: { storeId: "browser-store", name: "QA Back", code: "qa-back", colorToken: "blue", displayOrder: 1 } });
  const role = await roster.shiftRole.create({ data: { storeId: "browser-store", code: "qa-back", nameZh: "QA Back", colorToken: "#2563eb" } });
  await roster.shift.create({ data: { id: "qa-draft-role-shift", storeId: "browser-store", rosterPeriodId: "qa-draft-period",
    date: new Date("2026-10-10T00:00:00.000Z"), startAt: new Date("2026-10-09T22:00:00.000Z"),
    endAt: new Date("2026-10-10T00:00:00.000Z"), shiftRoleId: role.id,
    roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
    assignments: { create: { employeeId: "browser-regular", employeeNameSnapshot: "Regular Bob", employeeTypeSnapshot: "REGULAR" } },
  } });
  console.log(JSON.stringify({ seeded: true, roleId: role.id, draftShiftId: "qa-draft-role-shift" }));
} finally {
  await roster.$disconnect();
  await evaluate.$disconnect();
}
