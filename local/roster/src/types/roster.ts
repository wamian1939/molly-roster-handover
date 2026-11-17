export type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";
export type RosterStatus = "DRAFT" | "PUBLISHED";

export type RosterPeriod = {
  id: string;
  storeId: string;
  startDate: string;
  endDate: string;
  cycleType: "WEEK" | "FORTNIGHT";
  status: RosterStatus;
  version: number;
  publishedAt: string | null;
};

export type ShiftRole = {
  id: string;
  storeId: string | null;
  code: string;
  nameZh: string;
  /** Frontend-only Evaluate job ID attached after formal-role verification. */
  formalJobId?: string;
  colorToken: string;
  requiredSkillCodes: string[];
  isActive?: boolean;
  displayOrder?: number;
  version?: number;
};

export type ShiftTemplate = { id: string; storeId: string; name: string; startTime: string; endTime: string; breakMinutes: number; shiftRoleId: string | null; isActive: boolean; displayOrder: number; version: number; shiftRole: ShiftRole | null };
export type AvailabilitySource = "MANUAL" | "TEMPLATE" | "SCRIPT";
export type AvailabilityTemplateSlot = { dayOffset: number; status: AvailabilityStatus; startTime: string | null; endTime: string | null; endNextDay?: boolean };
export type AvailabilityTemplate = { id: string; storeId: string; name: string; slots: AvailabilityTemplateSlot[]; isActive: boolean; displayOrder: number; version: number };
export type RosterStoreSettings = { id?: string; storeId: string; timezone: string; openingTime: string; closingTime: string; slotIntervalMinutes: 15 | 30 | 60; minimumShiftMinutes: number; defaultBreakMinutes: number; weekStartsOn: number; cycleType: "WEEK" | "FORTNIGHT"; fortnightAnchorDate?: string | null; weeklyHourWarning: number; dailyHourWarning: number; version?: number };
export type PeriodSummary = { period: RosterPeriod; shiftCount: number; assignmentCount: number; totalHours: number; employeeHours: Array<{ employeeId: string; name: string; hours: number }>; roleHours: Array<{ role: string; hours: number }> };

export type ShiftAssignment = {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  employeeTypeSnapshot: string;
  officialScoreSnapshot: string | null;
  tierSnapshot: string | null;
};

export type Shift = {
  /** Browser-only accepted candidate. Never pass this record to write APIs. */
  agentPreview?: boolean;
  agentPattern?: string;
  id: string;
  rosterPeriodId: string;
  storeId: string;
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  roleNameSnapshot: string;
  roleColorSnapshot: string;
  publicNote: string | null;
  internalNote: string | null;
  version: number;
  shiftRole: ShiftRole;
  assignments: ShiftAssignment[];
};

export type CalendarResponse = { storeId: string; from: string; to: string; periods: RosterPeriod[]; shifts: Shift[] };

export type PublicationAssignment = {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  employeeTypeSnapshot: string;
  employmentTypeSnapshot: string | null;
  officialScoreSnapshot?: number | null;
  tierSnapshot?: string | null;
};
export type PublicationShift = {
  id: string;
  rosterPeriodId: string;
  storeId: string;
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  roleNameSnapshot: string;
  roleColorSnapshot: string;
  publicNote: string | null;
  internalNote?: string | null;
  assignments: PublicationAssignment[];
};
export type PublicationSnapshot = {
  schemaVersion: 1;
  store: { id: string; name: string };
  timezone?: string;
  period: Pick<RosterPeriod, "id" | "storeId" | "startDate" | "endDate" | "cycleType" | "status" | "version">;
  publishedBy: { accountId: string; displayName: string };
  shifts: PublicationShift[];
};
export type PublicationSummary = {
  id: string;
  rosterPeriodId: string;
  revisionNumber: number;
  periodVersion: number;
  publishedAt: string;
  publishedBy: { accountId: string; displayName: string };
  store: { id: string; name: string };
  period: PublicationSnapshot["period"];
  shiftCount: number;
  assignmentCount: number;
  totalHours: number;
};
export type PublicationDetail = PublicationSummary & { snapshot: PublicationSnapshot };

export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
export type EmployeeAvailability = {
  id: string;
  employeeId: string;
  storeId: string;
  date: string;
  startAt: string | null;
  endAt: string | null;
  status: AvailabilityStatus;
  note: string | null;
  source: AvailabilitySource;
  version: number;
};
