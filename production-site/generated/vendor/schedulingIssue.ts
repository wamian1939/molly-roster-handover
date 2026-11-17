import { HttpError } from "./httpError.js";

export type SchedulingSeverity = "BLOCKING_ERROR" | "WARNING" | "INFORMATIONAL";
export type SchedulingCode =
  | "PERIOD_PUBLISHED" | "STALE_VERSION" | "INVALID_TIME_RANGE" | "INVALID_CROSS_DAY"
  | "INVALID_EMPLOYEE_SCOPE" | "ARCHIVED_EMPLOYEE" | "EMPLOYEE_UNAVAILABLE"
  | "SHIFT_OVERLAP" | "CROSS_STORE_CONFLICT" | "OUTSIDE_OPERATING_HOURS"
  | "MIN_SHIFT_DURATION" | "INVALID_BREAK" | "INVALID_SLOT_ALIGNMENT"
  | "TARGET_PERIOD_CONFLICT" | "SHIFT_PERIOD_MISMATCH" | "INVALID_AVAILABILITY_DATE" | "INVALID_AVAILABILITY_RANGE" | "NO_SOURCE_SHIFTS" | "INVALID_ASSIGNMENTS"
  | "STORE_TIMEZONE_LOCKED" | "INACTIVE_SHIFT_ROLE" | "UNVERIFIED_SHIFT_ROLE" | "UNQUALIFIED_EMPLOYEE_ROLE" | "CREATE_REPLAY_CONFLICT" | "CREATE_REPLAY_GONE"
  | "BREAK_WARNING" | "WEEKLY_HOURS_WARNING";

export type SchedulingIssue = {
  code: SchedulingCode;
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

export class SchedulingError extends HttpError {
  readonly validation: SchedulingIssue;
  constructor(status: number, issue: Omit<SchedulingIssue, "severity">) {
    super(status, issue.message);
    this.name = "SchedulingError";
    this.validation = { ...issue, severity: "BLOCKING_ERROR" };
  }
}

// One primary reason is shown first. Preview lists may include additional reasons.
export const schedulingPrecedence: readonly SchedulingCode[] = [
  "PERIOD_PUBLISHED", "STALE_VERSION", "STORE_TIMEZONE_LOCKED", "SHIFT_PERIOD_MISMATCH", "INVALID_TIME_RANGE", "INVALID_CROSS_DAY", "INVALID_AVAILABILITY_DATE", "INVALID_AVAILABILITY_RANGE",
  "INVALID_EMPLOYEE_SCOPE", "ARCHIVED_EMPLOYEE", "INACTIVE_SHIFT_ROLE", "UNVERIFIED_SHIFT_ROLE", "UNQUALIFIED_EMPLOYEE_ROLE", "OUTSIDE_OPERATING_HOURS",
  "MIN_SHIFT_DURATION", "INVALID_BREAK", "INVALID_SLOT_ALIGNMENT", "EMPLOYEE_UNAVAILABLE",
  "SHIFT_OVERLAP", "CROSS_STORE_CONFLICT", "TARGET_PERIOD_CONFLICT", "CREATE_REPLAY_CONFLICT", "CREATE_REPLAY_GONE", "NO_SOURCE_SHIFTS", "INVALID_ASSIGNMENTS",
  "BREAK_WARNING", "WEEKLY_HOURS_WARNING",
];

export function firstSchedulingIssue(issues: SchedulingIssue[]) {
  return [...issues].sort((left, right) => schedulingPrecedence.indexOf(left.code) - schedulingPrecedence.indexOf(right.code))[0];
}

export function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}
