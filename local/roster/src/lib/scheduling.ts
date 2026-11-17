import type { EmployeeAvailability, Shift, ShiftRole } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";
import { weekRange } from "./dateTime";

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) { return startA < endB && endA > startB; }

export function conflictingEmployeeIds(shifts: Shift[], start: Date, end: Date, excludeShiftId?: string) {
  return new Set(shifts.filter((shift) => shift.id !== excludeShiftId && rangesOverlap(new Date(shift.startAt), new Date(shift.endAt), start, end)).flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)));
}

export function availabilityWarning(rows: EmployeeAvailability[] | undefined, start: Date, end: Date) {
  const slots = (rows ?? []).filter((row) => row.status !== "UNKNOWN" && row.startAt && row.endAt);
  if (!slots.length) return "可用时间未知";
  if (slots.some((row) => row.status === "UNAVAILABLE" && rangesOverlap(new Date(row.startAt!), new Date(row.endAt!), start, end))) return "标记为不可用";
  const available = slots.filter((row) => row.status === "AVAILABLE").sort((left, right) => new Date(left.startAt!).getTime() - new Date(right.startAt!).getTime());
  let coveredUntil = start.getTime();
  for (const row of available) {
    const slotStart = new Date(row.startAt!).getTime();
    if (slotStart > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, new Date(row.endAt!).getTime());
    if (coveredUntil >= end.getTime()) return null;
  }
  return available.length ? "超出可用时段" : "没有已登记的可用时间";
}

export function missingRoleSkills(role: ShiftRole | null, employee: RosterEmployee) { return role?.requiredSkillCodes.filter((code) => !employee.skillSummary.qualifiedSkillCodes.includes(code)) ?? []; }

export function weeklyHours(shifts: Shift[], date: string) {
  const { startDate, endDate } = weekRange(date);
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    if (shift.date < startDate || shift.date > endDate) continue;
    const start = new Date(shift.startAt);
    const hours = Math.max(0, (new Date(shift.endAt).getTime() - start.getTime()) / 3_600_000 - shift.breakMinutes / 60);
    for (const assignment of shift.assignments) totals.set(assignment.employeeId, (totals.get(assignment.employeeId) ?? 0) + hours);
  }
  return totals;
}

export type WorkRuleIssue = {
  code: "BREAK_WARNING" | "DAILY_HOURS_WARNING" | "WEEKLY_HOURS_WARNING";
  severity: "WARNING";
  message: string;
  employeeId?: string;
  employeeName?: string;
  shiftId?: string;
  storeId?: string;
  metadata: { date: string; hours?: number; threshold?: number; breakMinutes?: number; recommendedBreakMinutes?: number };
};

export function workRuleIssues(shifts: Shift[], rules: { weeklyHourWarning: number; dailyHourWarning: number; defaultBreakMinutes: number; weekStartsOn: number }): WorkRuleIssue[] {
  const daily = new Map<string, { employeeId: string; name: string; date: string; hours: number }>();
  const weekly = new Map<string, { employeeId: string; name: string; weekStart: string; hours: number }>();
  const issues: WorkRuleIssue[] = [];
  for (const shift of shifts) {
    const grossHours = Math.max(0, (new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 3_600_000);
    const netHours = Math.max(0, grossHours - shift.breakMinutes / 60);
    if (grossHours >= 5 && shift.breakMinutes < rules.defaultBreakMinutes) issues.push({
      code: "BREAK_WARNING", severity: "WARNING", shiftId: shift.id, storeId: shift.storeId,
      message: `${shift.date} ${shift.roleNameSnapshot} 的休息少于门店默认 ${rules.defaultBreakMinutes} 分钟`,
      metadata: { date: shift.date, breakMinutes: shift.breakMinutes, recommendedBreakMinutes: rules.defaultBreakMinutes },
    });
    const weekStart = startOfConfiguredWeek(shift.date, rules.weekStartsOn);
    for (const assignment of shift.assignments) {
      const dailyKey = `${assignment.employeeId}:${shift.date}`;
      const currentDay = daily.get(dailyKey) ?? { employeeId: assignment.employeeId, name: assignment.employeeNameSnapshot, date: shift.date, hours: 0 };
      currentDay.hours += netHours;
      daily.set(dailyKey, currentDay);
      const weeklyKey = `${assignment.employeeId}:${weekStart}`;
      const currentWeek = weekly.get(weeklyKey) ?? { employeeId: assignment.employeeId, name: assignment.employeeNameSnapshot, weekStart, hours: 0 };
      currentWeek.hours += netHours;
      weekly.set(weeklyKey, currentWeek);
    }
  }
  for (const item of daily.values()) if (item.hours > rules.dailyHourWarning) issues.push({
    code: "DAILY_HOURS_WARNING", severity: "WARNING", employeeId: item.employeeId, employeeName: item.name,
    message: `${item.name} 在 ${item.date} 排班 ${item.hours.toFixed(1)} 小时，超过每日 ${rules.dailyHourWarning} 小时预警`,
    metadata: { date: item.date, hours: item.hours, threshold: rules.dailyHourWarning },
  });
  for (const item of weekly.values()) if (item.hours > rules.weeklyHourWarning) issues.push({
    code: "WEEKLY_HOURS_WARNING", severity: "WARNING", employeeId: item.employeeId, employeeName: item.name,
    message: `${item.name} 在 ${item.weekStart} 起一周排班 ${item.hours.toFixed(1)} 小时，超过每周 ${rules.weeklyHourWarning} 小时预警`,
    metadata: { date: item.weekStart, hours: item.hours, threshold: rules.weeklyHourWarning },
  });
  return issues;
}

export function workRuleWarnings(shifts: Shift[], rules: { weeklyHourWarning: number; dailyHourWarning: number; defaultBreakMinutes: number; weekStartsOn: number }) {
  return workRuleIssues(shifts, rules).map((issue) => issue.message);
}

export function scoreLabel(employee: Pick<RosterEmployee, "officialScore">) { return employee.officialScore ? `${employee.officialScore.tier} · ${employee.officialScore.score.toFixed(1)}` : "暂无正式评分"; }
export function dateBelongsToRange(date: string, startDate: string, endDate: string) { return date >= startDate && date <= endDate; }
export function filterEmployees(employees: RosterEmployee[], search: string, employeeType: string, tier: string) {
  const keyword = search.trim().toLocaleLowerCase();
  return employees.filter((employee) => (!keyword || employee.displayName.toLocaleLowerCase().includes(keyword)) && (employeeType === "ALL" || employee.employeeType === employeeType) && (tier === "ALL" || employee.officialScore?.tier === tier));
}

export function filterEmployeesByRoles(employees: RosterEmployee[], roles: ShiftRole[], roleIds: string[]) {
  if (!roleIds.length) return employees;
  const selectedRoles = roles.filter((role) => roleIds.includes(role.id));
  if (!selectedRoles.length) return employees;
  return employees.filter((employee) => selectedRoles.some((role) => missingRoleSkills(role, employee).length === 0));
}

export function filterEmployeesByFormalPosition(employees: RosterEmployee[], positionId: string) {
  if (positionId === "ALL") return employees;
  if (positionId === "UNCONFIRMED") return employees.filter((employee) => !employee.positions?.length);
  return employees.filter((employee) => employee.positions?.some((position) => position.id === positionId));
}

function startOfConfiguredWeek(date: string, weekStartsOn: number) {
  return weekRange(date, weekStartsOn).startDate;
}
