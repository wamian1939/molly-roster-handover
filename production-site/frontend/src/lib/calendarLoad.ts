import { activeCalendarPeriod, coveredPeriodShifts } from "./calendarPeriod";
import { rosterRepository } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import type { CalendarResponse, PeriodSummary, ShiftRole, ShiftTemplate } from "../types/roster";
import { assertRosterSettingsResponse } from "./rosterSettingsResponse";
import { verifiedShiftRoles } from "./verifiedShiftRoles";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validPeriodSummary(value: unknown): value is PeriodSummary {
  if (!record(value) || !record(value.period)) return false;
  const period = value.period;
  const nonempty = (field: unknown) => typeof field === "string" && field.trim().length > 0;
  const hours = (field: unknown) => typeof field === "number" && Number.isFinite(field) && field >= 0;
  const count = (field: unknown) => Number.isInteger(field) && Number(field) >= 0;
  return nonempty(period.id) && nonempty(period.storeId)
    && typeof period.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(period.startDate)
    && typeof period.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(period.endDate)
    && period.startDate <= period.endDate
    && (period.cycleType === "WEEK" || period.cycleType === "FORTNIGHT")
    && (period.status === "DRAFT" || period.status === "PUBLISHED")
    && Number.isInteger(period.version) && Number(period.version) > 0
    && (period.publishedAt === null || (typeof period.publishedAt === "string" && Number.isFinite(Date.parse(period.publishedAt))))
    && count(value.shiftCount) && count(value.assignmentCount) && hours(value.totalHours)
    && Array.isArray(value.employeeHours) && value.employeeHours.every((row: unknown) =>
      record(row) && nonempty(row.employeeId) && nonempty(row.name) && hours(row.hours))
    && Array.isArray(value.roleHours) && value.roleHours.every((row: unknown) =>
      record(row) && nonempty(row.role) && hours(row.hours));
}

function validEditingContext(roles: unknown, workforce: unknown, jobs: unknown, storeId: string): boolean {
  if (!Array.isArray(roles) || !roles.every((role) => record(role) && typeof role.id === "string"
    && (role.storeId === null || role.storeId === storeId) && typeof role.code === "string"
    && typeof role.nameZh === "string" && typeof role.colorToken === "string"
    && Array.isArray(role.requiredSkillCodes) && role.requiredSkillCodes.every((code: unknown) => typeof code === "string"))) return false;
  if (!record(jobs) || !Array.isArray(jobs.jobs) || !jobs.jobs.every((job: unknown) => record(job)
    && typeof job.id === "string" && job.storeId === storeId && typeof job.name === "string"
    && (job.code === null || typeof job.code === "string") && typeof job.colorToken === "string"
    && typeof job.displayOrder === "number" && typeof job.isActive === "boolean")) return false;
  return record(workforce) && Array.isArray(workforce.employees) && typeof workforce.generatedAt === "string"
    && Number.isFinite(Date.parse(workforce.generatedAt)) && workforce.employees.every((employee: unknown) =>
      record(employee) && typeof employee.id === "string" && employee.storeId === storeId
      && typeof employee.displayName === "string" && typeof employee.isActive === "boolean"
      && (employee.employeeType === "REGULAR" || employee.employeeType === "TRAINING")
      && (employee.employmentType === null || typeof employee.employmentType === "string")
      && (employee.positions === undefined || (Array.isArray(employee.positions)
        && employee.positions.every((position: unknown) => record(position) && typeof position.id === "string"
          && typeof position.name === "string")))
      && (employee.officialScore === null || (record(employee.officialScore)
        && typeof employee.officialScore.score === "number" && Number.isFinite(employee.officialScore.score)
        && typeof employee.officialScore.tier === "string"))
      && record(employee.skillSummary) && Array.isArray(employee.skillSummary.qualifiedSkillCodes)
      && employee.skillSummary.qualifiedSkillCodes.every((code: unknown) => typeof code === "string"));
}

export function scopedCalendarResponse(calendar: CalendarResponse | null, storeId: string | null, range: { from: string; to: string } | null) {
  return calendar && storeId && range && calendar.storeId === storeId && calendar.from === range.from && calendar.to === range.to
    ? calendar : null;
}

export function usableCalendarTemplates(templates: ShiftTemplate[], roles: ShiftRole[]): ShiftTemplate[] {
  const roleIds = new Set(roles.map((role) => role.id));
  return templates.filter((template) => template.isActive && (!template.shiftRoleId || roleIds.has(template.shiftRoleId)));
}

export async function loadCalendarSnapshot(storeId: string, range: { from: string; to: string }, isCurrent: () => boolean, focusedDate?: string) {
  const [calendarResult, rolesResult, workforceResult, storeSettingsResult, jobsResult] = await Promise.allSettled([
    rosterRepository.calendar(storeId, range.from, range.to),
    rosterRepository.roles(storeId),
    workforceRepository.employees(storeId),
    rosterRepository.settings(storeId),
    workforceRepository.jobs(storeId),
  ]);
  if (!isCurrent()) return null;
  if (calendarResult.status === "rejected") throw calendarResult.reason;
  if (storeSettingsResult.status === "rejected") throw storeSettingsResult.reason;
  const calendar = calendarResult.value;
  const settings = assertRosterSettingsResponse(storeSettingsResult.value, storeId);
  const failedEditContext = [rolesResult, workforceResult, jobsResult].find((result) => result.status === "rejected");
  if (failedEditContext?.status === "rejected") {
    return {
      calendar, roles: [], jobs: [], workforce: { employees: [], generatedAt: null }, settings,
      summary: null, periodContextError: null, periodShifts: [],
      editContextError: failedEditContext.reason ?? new Error("员工与岗位数据加载失败"),
    };
  }
  if (rolesResult.status !== "fulfilled" || workforceResult.status !== "fulfilled" || jobsResult.status !== "fulfilled") {
    throw new Error("员工与岗位数据加载失败");
  }
  if (!validEditingContext(rolesResult.value, workforceResult.value, jobsResult.value, storeId)) {
    return {
      calendar, roles: [], jobs: [], workforce: { employees: [], generatedAt: null }, settings,
      summary: null, periodContextError: null, periodShifts: [],
      editContextError: new Error("员工与岗位数据响应不完整或门店归属不一致，请重试加载"),
    };
  }
  const allRoles = rolesResult.value;
  const workforce = workforceResult.value;
  const jobs = jobsResult.value.jobs;

  const activePeriod = activeCalendarPeriod(calendar.periods, range.from, range.to, focusedDate);
  const coveredShifts = activePeriod ? coveredPeriodShifts(calendar, activePeriod) : null;
  const [summaryResult, fullPeriodResult] = activePeriod
    ? await Promise.allSettled([rosterRepository.periodSummary(storeId, activePeriod.id),
      coveredShifts === null ? rosterRepository.calendar(storeId, activePeriod.startDate, activePeriod.endDate) : Promise.resolve(null)])
    : [null, null];
  if (!isCurrent()) return null;

  const failedContext = summaryResult?.status === "rejected" ? summaryResult
    : fullPeriodResult?.status === "rejected" ? fullPeriodResult : null;
  const fetchedSummary = summaryResult?.status === "fulfilled" ? summaryResult.value : null;
  const fullPeriod = fullPeriodResult?.status === "fulfilled" ? fullPeriodResult.value : null;
  const invalidSummary = summaryResult?.status === "fulfilled" && !validPeriodSummary(fetchedSummary);
  const periodChanged = activePeriod && !invalidSummary && fetchedSummary && (
    fetchedSummary.period.id !== activePeriod.id || fetchedSummary.period.storeId !== storeId
    || fetchedSummary.period.version !== activePeriod.version
    || fetchedSummary.period.status !== activePeriod.status
    || fetchedSummary.period.cycleType !== activePeriod.cycleType
    || fetchedSummary.period.startDate !== activePeriod.startDate
    || fetchedSummary.period.endDate !== activePeriod.endDate
    || fetchedSummary.period.publishedAt !== activePeriod.publishedAt
    || (coveredShifts === null && (!fullPeriod || fullPeriod.storeId !== storeId
      || fullPeriod.from !== activePeriod.startDate || fullPeriod.to !== activePeriod.endDate
      || !fullPeriod.periods.some((period) => period.id === activePeriod.id && period.version === activePeriod.version)))
  );
  const periodContextError = failedContext ? failedContext.reason ?? new Error("周期数据加载失败")
    : invalidSummary ? new Error("周期汇总数据不完整，请刷新核对后再发布")
      : periodChanged ? new Error("周期版本在读取期间发生变化，请刷新核对后再发布") : null;
  const summary = periodContextError === null && summaryResult?.status === "fulfilled" ? summaryResult.value : null;

  const roles = verifiedShiftRoles(allRoles, jobs, storeId);
  return {
    calendar, roles, jobs, workforce, settings, summary, periodContextError, editContextError: null,
    periodShifts: activePeriod && summary ? coveredShifts ?? fullPeriod!.shifts.filter((shift) => shift.rosterPeriodId === activePeriod.id) : [],
  };
}
