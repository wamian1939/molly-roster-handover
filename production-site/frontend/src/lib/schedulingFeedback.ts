export type SchedulingSeverity = "BLOCKING_ERROR" | "WARNING" | "INFORMATIONAL";
export type SchedulingIssue = {
  code: string;
  severity: SchedulingSeverity;
  message: string;
  employeeId?: string;
  employeeName?: string;
  shiftId?: string;
  storeId?: string;
  start?: string;
  end?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const time = (value: string | undefined, timezone: string) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "所选时间";

export function schedulingFeedback(issue: SchedulingIssue | undefined, fallback: string, timezone = DEFAULT_STORE_TIMEZONE): string {
  if (!issue) return fallback;
  const who = issue.employeeName ?? "该员工";
  switch (issue.code) {
    case "EMPLOYEE_UNAVAILABLE": return `${who} 在 ${time(issue.start, timezone)}–${time(issue.end, timezone)} 没有完整的可用时间；请调整时间或员工。`;
    case "SHIFT_OVERLAP": return `${who} 已有重叠班次${issue.start ? `（${time(issue.start, timezone)}–${time(issue.end, timezone)}）` : ""}；请调整时间或员工。`;
    case "CROSS_STORE_CONFLICT": return `${who} 已在门店 ${issue.storeId ?? "其他门店"} 排班${issue.start ? `（${time(issue.start, timezone)}–${time(issue.end, timezone)}）` : ""}；请调整时间或员工。`;
    case "PERIOD_PUBLISHED": return "该周期已经发布。请先重新打开为草稿，再修改班次。";
    case "STALE_VERSION": return "班次已被其他人修改。当前编辑未覆盖对方的更改；请刷新后核对，再重试。";
    case "MIN_SHIFT_DURATION": return `本门店最短班次为 ${issue.metadata?.minimumMinutes ?? "规定的"} 分钟。`;
    case "OUTSIDE_OPERATING_HOURS": return `班次不在本门店营业时段内${issue.metadata?.openingTime ? `（${issue.metadata.openingTime}–${issue.metadata.closingTime}）` : ""}。`;
    case "INVALID_TIME_RANGE": return "结束时间必须晚于开始时间。";
    case "INVALID_CROSS_DAY": return "跨日班次的日期或时长无效；请核对开始日期和次日结束时间。";
    case "ARCHIVED_EMPLOYEE": return `${who} 已归档或不属于当前门店，不能排班。`;
    case "INVALID_SLOT_ALIGNMENT": return `班次时间需要对齐 ${issue.metadata?.slotIntervalMinutes ?? "门店设定的"} 分钟间隔。`;
    case "TARGET_PERIOD_CONFLICT": return "目标日期已有排班周期；请刷新日历并选择其他日期。";
    case "INVALID_BREAK": return "休息时间必须短于班次时长。";
    case "SHIFT_PERIOD_MISMATCH": return "班次门店或日期与所属排班周期不一致；请联系管理员核对数据后再发布或复制。";
    case "UNQUALIFIED_EMPLOYEE_ROLE": return `${who} 尚未获得该正式岗位授权。请在 Evaluate 确认员工岗位，或选择已授权员工。`;
    default: return issue.message || fallback;
  }
}
import { DEFAULT_STORE_TIMEZONE } from "./storeTime";
