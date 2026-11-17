import { DateTime } from "luxon";
import { PayrollError } from "./store.js";
export function paidMinutes(start: string, end: string, unpaid: number) {
  const a = Date.parse(start),
    b = Date.parse(end),
    duration = (b - a) / 60000;
  if (
    !Number.isInteger(duration) ||
    duration <= 0 ||
    duration > 2880 ||
    !Number.isInteger(unpaid) ||
    unpaid < 0 ||
    unpaid > duration
  )
    throw new PayrollError(
      400,
      "班次时间或未付休息分钟无效（必须保留整数分钟）",
    );
  return duration - unpaid;
}
export const hours = (minutes: number) => Number((minutes / 60).toFixed(4));
export function isHourlyRate(rate: any, employee: any, refs: any) {
  if (rate?.RateType === "RATEPERUNIT")
    return ["HOUR", "HOURS"].includes(String(rate.TypeOfUnits).toUpperCase());
  if (rate?.RateType === "MULTIPLE") {
    const base = refs.rates?.find(
      (r: any) => r.EarningsRateID === employee?.OrdinaryEarningsRateID,
    );
    return (
      base?.RateType === "RATEPERUNIT" &&
      ["HOUR", "HOURS"].includes(String(base.TypeOfUnits).toUpperCase())
    );
  }
  return false;
}
export const day = (value: string) => {
  const m = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(value ?? "");
  return m
    ? new Date(+m[1]).toISOString().slice(0, 10)
    : String(value ?? "").slice(0, 10);
};
export function payrollPeriod(date: string, calendar: any) {
  const type = calendar.CalendarType,
    span = (
      { WEEKLY: 7, FORTNIGHTLY: 14, FOURWEEKLY: 28 } as Record<string, number>
    )[type];
  const anchor = DateTime.fromISO(day(calendar.StartDate), { zone: "UTC" }),
    d = DateTime.fromISO(date, { zone: "UTC" });
  if (!span || !anchor.isValid || !d.isValid)
    throw new PayrollError(
      400,
      `发薪周期 ${type ?? "未知"} 不能可靠推导，请在 Xero 配置有起始日的 Weekly/Fortnightly/FourWeekly Calendar`,
    );
  const start = anchor.plus({
    days: Math.floor(d.diff(anchor, "days").days / span) * span,
  });
  return {
    startDate: start.toISODate()!,
    endDate: start.plus({ days: span - 1 }).toISODate()!,
  };
}
export function prepareShifts(sources: any[]) {
  const rows: any[] = [],
    seen = new Set<string>();
  const uniqueSources = new Set<string>();
  for (const source of sources) {
    if (uniqueSources.has(source.sourceKey))
      throw new PayrollError(
        400,
        "Select only one version per store/roster period",
      );
    uniqueSources.add(source.sourceKey);
    if (!source.timezone)
      throw new PayrollError(409, "旧发布版本缺少门店时区，不能推定工资日期");
    for (const shift of source.shifts) {
      paidMinutes(shift.startAt, shift.endAt, shift.breakMinutes);
      const zone = source.timezone;
      if (
        ![
          "Australia/Sydney",
          "Australia/Melbourne",
          "Australia/Brisbane",
          "Australia/Adelaide",
          "Australia/Perth",
          "Australia/Darwin",
          "Australia/Hobart",
        ].includes(zone)
      )
        throw new PayrollError(400, "不支持的工资时区");
      for (const assignment of shift.assignments) {
        if (!assignment.employeeId)
          throw new PayrollError(
            409,
            "发布版本缺少稳定员工 ID，不能按姓名匹配工资",
          );
        const id = `${source.storeId}:${shift.id}:${assignment.employeeId}`;
        if (seen.has(id)) throw new PayrollError(400, "重复选择了同一个班次");
        seen.add(id);
        let cursor = DateTime.fromISO(shift.startAt, { setZone: true }).setZone(
            zone,
          ),
          end = DateTime.fromISO(shift.endAt, { setZone: true }).setZone(zone);
        const segments = [];
        while (cursor < end) {
          const next = cursor.startOf("day").plus({ days: 1 });
          const stop = next < end ? next : end;
          segments.push({
            date: cursor.toISODate()!,
            startAt: cursor.toUTC().toISO()!,
            endAt: stop.toUTC().toISO()!,
            duration: Math.round(stop.diff(cursor, "minutes").minutes),
          });
          cursor = stop;
        }
        let remaining = shift.breakMinutes;
        segments.forEach((segment, index) => {
          const deduction =
            segments.length === 1
              ? remaining
              : Math.min(remaining, segment.duration);
          remaining -= deduction;
          rows.push({
            id: id + ":" + index,
            employeeId: assignment.employeeId,
            employeeName: assignment.employeeNameSnapshot,
            sourceKey: source.sourceKey,
            storeId: source.storeId,
            timezone: zone,
            date: segment.date,
            startAt: segment.startAt,
            endAt: segment.endAt,
            scheduledMinutes: segment.duration - deduction,
            unpaidBreakMinutes: deduction,
            paidMinutes: segment.duration - deduction,
            category: "",
            confirmed: false,
            reason: "",
            requiresBreakAllocation:
              segments.length > 1 && shift.breakMinutes > 0,
          });
        });
      }
    }
  }
  for (const row of rows) {
    if (
      rows.some(
        (other) =>
          other !== row &&
          other.employeeId === row.employeeId &&
          other.startAt < row.endAt &&
          other.endAt > row.startAt,
      )
    )
      throw new PayrollError(
        400,
        "Overlapping shifts for the same employee; reconcile stores first",
      );
  }
  return rows;
}
export function buildTargets(rows: any[], maps: any, refs: any) {
  const errors: any[] = [],
    groups = new Map<string, any>();
  for (const row of rows) {
    const issue = (reason: string) =>
      errors.push({ employeeId: row.employeeId, date: row.date, reason });
    if (!row.confirmed || !row.reason?.trim())
      issue("请确认实际工时并填写确认/调整说明");
    if (
      !Number.isInteger(row.paidMinutes) ||
      row.paidMinutes < 0 ||
      row.paidMinutes > 1440 ||
      row.paidMinutes + (row.unpaidBreakMinutes ?? 0) > 1440
    )
      issue("实际分钟数不合法");
    const match = maps.employees?.[row.employeeId],
      employee = refs.employees?.find(
        (e: any) => e.EmployeeID === match?.xeroEmployeeId,
      );
    if (
      !employee ||
      employee.Status === "TERMINATED" ||
      employee.TerminationDate
    ) {
      issue("员工未匹配或 Xero 员工已离职");
      continue;
    }
    if (match.status !== "Matched") {
      issue("员工映射需要人工复核");
      continue;
    }
    const calendar = refs.calendars?.find(
      (c: any) => c.PayrollCalendarID === employee.PayrollCalendarID,
    );
    if (!calendar) {
      issue("员工没有有效的 Xero Payroll Calendar");
      continue;
    }
    let period;
    try {
      period = payrollPeriod(row.date, calendar);
    } catch (e) {
      issue((e as Error).message);
      continue;
    }
    const rateId = maps.rates?.[row.category],
      rate = refs.rates?.find((r: any) => r.EarningsRateID === rateId);
    if (!isHourlyRate(rate, employee, refs)) {
      issue("Earnings Rate 缺失或不是按小时计量；请人工选择实际适用类别");
      continue;
    }
    const trackingItemID = maps.tracking?.[row.storeId];
    if (
      trackingItemID &&
      !refs.tracking?.some((t: any) => t.TrackingItemID === trackingItemID)
    ) {
      issue("门店 Tracking Item 不再有效");
      continue;
    }
    const key = [
      employee.EmployeeID,
      calendar.PayrollCalendarID,
      period.startDate,
      period.endDate,
    ].join(":");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeeID: employee.EmployeeID,
        payrollCalendarID: calendar.PayrollCalendarID,
        ...period,
        lines: [],
      };
      groups.set(key, group);
    }
    if (row.paidMinutes === 0) continue;
    let line = group.lines.find(
      (l: any) =>
        l.date === row.date &&
        l.earningsRateID === rateId &&
        (l.trackingItemID ?? "") === (trackingItemID ?? ""),
    );
    if (!line) {
      line = {
        date: row.date,
        earningsRateID: rateId,
        ...(trackingItemID ? { trackingItemID } : {}),
        minutes: 0,
      };
      group.lines.push(line);
    }
    line.minutes += row.paidMinutes;
  }
  const daily = new Map<string, number>();
  for (const row of rows) {
    const k = row.employeeId + ":" + row.date;
    daily.set(k, (daily.get(k) ?? 0) + row.paidMinutes);
  }
  for (const [k, total] of daily)
    if (total > 1440)
      errors.push({
        employeeId: k.slice(0, k.lastIndexOf(":")),
        date: k.slice(-10),
        reason:
          "Total employee hours across all rates/stores exceeds 24 hours per day",
      });
  for (const group of groups.values())
    for (const line of group.lines) {
      if (line.minutes > 1440)
        errors.push({
          employeeId: group.employeeId,
          date: line.date,
          reason: "合并工时超过一天",
        });
      line.numberOfUnits = hours(line.minutes);
    }
  return {
    groups: [...groups.values()].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.employeeID.localeCompare(b.employeeID),
    ),
    errors,
  };
}
