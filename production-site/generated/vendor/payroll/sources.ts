import type { RosterService } from "../rosterService.js";
import { PayrollError } from "./store.js";
export function payrollSources(roster: RosterService) {
  return async (selections: any[]) => {
    const out = [];
    for (const s of selections) {
      const data = s.publicationId
        ? await roster.exportPublication(s.storeId, s.publicationId)
        : await roster.exportPeriod(s.storeId, s.periodId);
      const timezone = s.publicationId
        ? "timezone" in data
          ? data.timezone
          : null
        : (await roster.getSettings(s.storeId))?.timezone;
      if (!timezone)
        throw new PayrollError(
          409,
          "请先保存门店时区；旧发布快照缺少时区不能用于工资同步",
        );
      out.push({
        storeId: s.storeId,
        periodId: data.period.id,
        sourceKey: s.storeId + ":" + data.period.id,
        timezone,
        period: data.period,
        shifts: data.shifts.map((shift: any) => ({
          id: shift.id,
          date: shift.date,
          startAt: shift.startAt,
          endAt: shift.endAt,
          breakMinutes: shift.breakMinutes,
          assignments: shift.assignments.map((a: any) => ({
            employeeId: a.employeeId,
            employeeNameSnapshot: a.employeeNameSnapshot,
          })),
        })),
      });
    }
    return out;
  };
}
