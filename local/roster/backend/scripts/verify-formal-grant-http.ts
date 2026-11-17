import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient as RosterPrisma } from "@prisma/client";

const evaluateRequire = createRequire(resolve(process.cwd(), "../../Evaluate Molly/backend/package.json"));
const { PrismaClient: EvaluatePrisma } = evaluateRequire("@prisma/client");
const rosterState = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const evaluateState = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};

function assertDisposable(state: { schema: string; isolatedUrl: string }, pattern: RegExp, port: string, database: string) {
  const url = new URL(state.isolatedUrl);
  if (!pattern.test(state.schema) || !["localhost", "127.0.0.1"].includes(url.hostname)
    || url.port !== port || url.pathname !== database || url.searchParams.get("schema") !== state.schema) {
    throw new Error("Expected the exact disposable PostgreSQL schema");
  }
}

assertDisposable(rosterState, /^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/, "5433", "/molly_roster");
assertDisposable(evaluateState, /^codex_browser_acceptance_[0-9]+$/, "5432", "/evaluate_molly");

const roster = new RosterPrisma({ datasourceUrl: rosterState.isolatedUrl });
const evaluate = new EvaluatePrisma({ datasourceUrl: evaluateState.isolatedUrl });
try {
  const [job, grants, shifts, draft, published, publicationCount, availabilityCount] = await Promise.all([
    evaluate.storeJobDefinition.findFirstOrThrow({ where: { storeId: "browser-store", code: "qa-front" } }),
    evaluate.employeeJobAssignment.findMany({ where: { storeId: "browser-store" }, select: { jobId: true, employeeId: true } }),
    roster.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    roster.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    roster.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    roster.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    roster.employeeAvailability.count({ where: { storeId: "browser-store" } }),
  ]);
  const newShifts = shifts.filter((shift) => !["qa-draft-shift", "qa-draft-grouped-shift", "qa-published-shift"].includes(shift.id));
  const created = newShifts[0];
  const original = shifts.filter((shift) => shift !== created);
  if (grants.length !== 1 || grants[0]?.jobId !== job.id || grants[0].employeeId !== "browser-regular"
    || shifts.length !== 4 || newShifts.length !== 1 || !created
    || created.date.toISOString().slice(0, 10) !== "2026-10-10"
    || created.startAt.toISOString() !== "2026-10-09T23:00:00.000Z"
    || created.endAt.toISOString() !== "2026-10-10T00:00:00.000Z"
    || created.roleNameSnapshot !== "QA Front" || created.assignments.length !== 1
    || created.assignments[0]?.employeeId !== "browser-regular"
    || original.some((shift) => shift.version !== 1)
    || draft.version !== 2 || published.version !== 1 || publicationCount !== 1 || availabilityCount !== 2) {
    throw new Error("Formal grant HTTP acceptance did not preserve the expected source, assignment and history state");
  }
  console.log(JSON.stringify({ verified: true, grantCount: grants.length, created: newShifts.length,
    canonicalEmployee: created.assignments[0].employeeId, originalShiftVersions: original.map(({ id, version }) => ({ id, version })),
    draftVersion: draft.version, publishedVersion: published.version, publicationCount, availabilityCount }));
} finally {
  await roster.$disconnect();
  await evaluate.$disconnect();
}
