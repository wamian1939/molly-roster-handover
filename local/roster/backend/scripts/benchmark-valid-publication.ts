import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService, type AssignmentSnapshot } from "../src/rosterService.js";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact local disposable Roster fixture schema");
}

const requireFromRoot = createRequire(join(process.cwd(), "..", "package.json"));
const { DateTime } = requireFromRoot("luxon") as typeof import("luxon");
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
const service = new RosterService(db);
const storeId = "valid-bench-store";
const periodId = "valid-bench-period";
const employeeCount = 500;

try {
  if (await db.rosterPeriod.count({ where: { storeId } })) throw new Error("Benchmark period already exists");
  const role = await db.shiftRole.create({ data: { storeId, code: "valid-bench-role", nameZh: "Benchmark", colorToken: "#647180" } });
  await db.rosterPeriod.create({ data: { id: periodId, storeId, startDate: new Date("2027-01-04"), endDate: new Date("2027-01-10"), cycleType: "WEEK", createdByAccountId: "benchmark" } });
  const employees: AssignmentSnapshot[] = Array.from({ length: employeeCount }, (_, index) => ({
    employeeId: `valid-bench-employee-${String(index).padStart(4, "0")}`,
    employeeNameSnapshot: `Benchmark ${String(index).padStart(4, "0")}`,
    employeeTypeSnapshot: "REGULAR",
    employmentTypeSnapshot: "FullTime",
    officialScoreSnapshot: null,
    tierSnapshot: null,
    officialScoreRoundId: null,
    officialScoreClosedAt: null,
  }));
  const availability = [];
  const shifts = [];
  const assignments = [];
  for (let day = 0; day < 5; day += 1) {
    const date = DateTime.fromISO("2027-01-04", { zone: "Australia/Sydney" }).plus({ days: day }).toISODate()!;
    const at = (time: string) => DateTime.fromISO(`${date}T${time}`, { zone: "Australia/Sydney" }).toUTC().toJSDate();
    for (let employeeIndex = 0; employeeIndex < employeeCount; employeeIndex += 1) {
      const employee = employees[employeeIndex]!;
      availability.push({ storeId, employeeId: employee.employeeId, date: new Date(`${date}T00:00:00.000Z`), status: "AVAILABLE" as const, startAt: at("09:00"), endAt: at("17:00") });
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const id = `valid-bench-shift-${day}-${employeeIndex}-${sequence}`;
        shifts.push({ id, rosterPeriodId: periodId, storeId, date: new Date(`${date}T00:00:00.000Z`), startAt: at(sequence ? "14:00" : "09:00"), endAt: at(sequence ? "17:00" : "12:00"), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, createdByAccountId: "benchmark", updatedByAccountId: "benchmark" });
        assignments.push({ shiftId: id, employeeId: employee.employeeId, employeeNameSnapshot: employee.employeeNameSnapshot, employeeTypeSnapshot: employee.employeeTypeSnapshot, employmentTypeSnapshot: employee.employmentTypeSnapshot });
      }
    }
  }
  const seededAt = performance.now();
  await db.$transaction(async (transaction) => {
    for (let offset = 0; offset < availability.length; offset += 500) await transaction.employeeAvailability.createMany({ data: availability.slice(offset, offset + 500) });
    for (let offset = 0; offset < shifts.length; offset += 500) await transaction.shift.createMany({ data: shifts.slice(offset, offset + 500) });
    for (let offset = 0; offset < assignments.length; offset += 500) await transaction.shiftAssignment.createMany({ data: assignments.slice(offset, offset + 500) });
  }, { timeout: 120_000 });
  const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const publishAt = performance.now();
  const published = await service.publishPeriod(storeId, periodId, period.version, { accountId: "benchmark", displayName: "Benchmark" }, { id: storeId, name: "Benchmark" }, employees);
  const snapshot = published.publication.snapshot as { shifts: unknown[] };
  if (snapshot.shifts.length !== shifts.length || published.period.status !== "PUBLISHED") throw new Error("Publication snapshot incomplete");
  console.log(JSON.stringify({ employees: employeeCount, shifts: shifts.length, availability: availability.length, seedMs: Math.round(publishAt - seededAt), publishMs: Math.round(performance.now() - publishAt), snapshotShifts: snapshot.shifts.length, status: published.period.status }));
} finally {
  await db.$disconnect();
}
