import { performance } from "node:perf_hooks";
import { groupShiftsForCalendar } from "../src/lib/calendarGrouping";
import { layoutCalendarShiftGroups } from "../src/lib/calendarOverlap";
import type { Shift } from "../src/types/roster";

const base = Date.parse("2026-10-05T00:00:00.000Z");
const samples = [50, 100, 500] as const;

for (const employees of samples) {
  const shifts = makeWeek(employees);
  const results: Array<{ groupMs: number; layoutMs: number; groups: number }> = [];
  for (let run = 0; run < 6; run += 1) {
    const started = performance.now();
    const grouped = groupShiftsForCalendar(shifts);
    const groupedAt = performance.now();
    const layout = layoutCalendarShiftGroups(grouped);
    const completed = performance.now();
    if (layout.length !== grouped.length) throw new Error("Layout lost a shift group");
    if (run > 0) results.push({ groupMs: groupedAt - started, layoutMs: completed - groupedAt, groups: grouped.length });
  }
  const middle = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({
    employees,
    shifts: shifts.length,
    groups: results[0].groups,
    medianGroupMs: Number(middle(results.map((item) => item.groupMs)).toFixed(2)),
    medianLayoutMs: Number(middle(results.map((item) => item.layoutMs)).toFixed(2)),
  }));
}

function makeWeek(employeeCount: number): Shift[] {
  const result: Shift[] = [];
  for (let day = 0; day < 5; day += 1) {
    const date = new Date(base + day * 86_400_000).toISOString().slice(0, 10);
    for (let employee = 0; employee < employeeCount; employee += 1) {
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const key = employee * 2 + sequence;
        const startSlot = key % 20;
        const durationSlots = 2 + Math.floor(key / 20) % 6;
        const roleIndex = Math.floor(key / 120) % 6;
        const breakMinutes = Math.floor(key / 720) % 3 * 15;
        const start = new Date(base + day * 86_400_000 + (9 * 60 + startSlot * 30) * 60_000);
        const end = new Date(start.getTime() + durationSlots * 30 * 60_000);
        const id = `qa-${day}-${employee}-${sequence}`;
        const role = `role-${roleIndex}`;
        result.push({
          id,
          rosterPeriodId: "qa-period",
          storeId: "qa-store",
          date,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          breakMinutes,
          shiftRoleId: role,
          roleNameSnapshot: role,
          roleColorSnapshot: "#647180",
          publicNote: null,
          internalNote: null,
          version: 1,
          shiftRole: { id: role, storeId: null, code: role, nameZh: role, colorToken: "#647180", requiredSkillCodes: [] },
          assignments: [{
            id: `assignment-${id}`,
            employeeId: `qa-employee-${employee}`,
            employeeNameSnapshot: `Employee ${employee}`,
            employeeTypeSnapshot: "REGULAR",
            officialScoreSnapshot: null,
            tierSnapshot: null,
          }],
        });
      }
    }
  }
  return result;
}
