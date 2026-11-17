import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Prisma, type AvailabilitySource, type AvailabilityStatus, type PrismaClient, type RosterCycleType } from "@prisma/client";
import { HttpError } from "./httpError.js";
import { assertRoleAssociationUnchanged, matchFormalRoles, type FormalJob } from "./formalRoleMatch.js";
import { SchedulingError, intervalsOverlap, type SchedulingCode } from "./schedulingIssue.js";
import { copyShiftWallClock, zonedClockToDate } from "./zonedCopy.js";
import { dateOnly, isCalendarDate, toDateString } from "./validation.js";
import type { PresetShortcut, ScriptSlot } from "./presetTimeSlotScript.js";
import { overlappingScriptSlotIndexes, presetTimeSlotReviewFingerprint, type PresetSlotReview } from "./presetTimeSlotReview.js";

const shiftInclude = {
  shiftRole: { select: { id: true, code: true, nameZh: true, colorToken: true, requiredSkillCodes: true, isActive: true, storeId: true } },
  assignments: { orderBy: { employeeNameSnapshot: "asc" as const } },
} satisfies Prisma.ShiftInclude;

export type AssignmentSnapshot = {
  employeeId: string;
  employeeNameSnapshot: string;
  employeeTypeSnapshot: string;
  employmentTypeSnapshot: string | null;
  officialScoreSnapshot: number | null;
  tierSnapshot: string | null;
  officialScoreRoundId: string | null;
  officialScoreClosedAt: string | null;
};

export type RoleQualifications = Record<string, string[]>;
export type AgentCalendarPlan = { storeId:string; runId:string; from:string; to:string; expectedToken:string; preserveExisting:boolean; applyDates?:string[];
  shifts:Array<{ key:string; sourceShiftId:string|null; fixed:boolean; value:Omit<ShiftMutation,"storeId"|"rosterPeriodId"> }> };

function unqualifiedAssignment(roleId: string, assignments: Array<{ employeeId: string; employeeNameSnapshot: string }>, qualified?: RoleQualifications) {
  if (!qualified) return undefined;
  const allowed = new Set(qualified[roleId] ?? []);
  return assignments.find((assignment) => !allowed.has(assignment.employeeId));
}

function assertRoleAssignmentsQualified(roleId: string, assignments: Array<{ employeeId: string; employeeNameSnapshot: string }>, qualified?: RoleQualifications, shiftId?: string) {
  const invalid = unqualifiedAssignment(roleId, assignments, qualified);
  if (invalid) throw new SchedulingError(422, { code: "UNQUALIFIED_EMPLOYEE_ROLE", shiftId, employeeId: invalid.employeeId,
    employeeName: invalid.employeeNameSnapshot,
    message: `${invalid.employeeNameSnapshot} 尚未获得该正式岗位授权，请先在 Evaluate 单独确认员工岗位` });
}

type ShiftMutation = {
  storeId: string;
  rosterPeriodId: string;
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  formalRoleName?: string;
  formalRoleColor?: string;
  publicNote?: string | null;
  internalNote?: string | null;
  assignments: AssignmentSnapshot[];
};

export type DraftCommitChange =
  | { kind: "create"; clientShiftId: string; value: Omit<ShiftMutation, "storeId" | "rosterPeriodId"> }
  | { kind: "update"; shiftId: string; baseVersion: number; value: Omit<ShiftMutation, "storeId" | "rosterPeriodId"> }
  | { kind: "delete"; shiftId: string; baseVersion: number };

type CreateReplayInput = Pick<ShiftMutation, "storeId" | "date" | "startAt" | "endAt" | "breakMinutes" | "shiftRoleId" | "publicNote" | "internalNote"> & {
  targetStartDate: string;
  targetEndDate: string;
  employeeIds: string[];
  clientShiftId?: string;
};

type PublicationShift = {
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
  assignments: Array<AssignmentSnapshot & { id: string }>;
};

type PublicationSnapshot = {
  schemaVersion: 1;
  store: { id: string; name: string };
  timezone?: string;
  period: { id: string; storeId: string; startDate: string; endDate: string; cycleType: RosterCycleType; status: "PUBLISHED"; version: number };
  publishedBy: { accountId: string; displayName: string };
  shifts: PublicationShift[];
};

export class RosterService {
  constructor(private readonly db: PrismaClient) {}

  async listPeriods(storeId: string, from: string, to: string) {
    const periods = await this.periodRows(storeId, from, to);
    return periods.map(serializePeriod);
  }

  private periodRows(storeId: string, from: string, to: string, db: PrismaClient | Prisma.TransactionClient = this.db) {
    return db.rosterPeriod.findMany({
      where: { storeId, startDate: { lte: dateOnly(to) }, endDate: { gte: dateOnly(from) } },
      orderBy: { startDate: "asc" },
    });
  }

  async createPeriod(input: { storeId: string; startDate: string; endDate: string; cycleType: RosterCycleType }, accountId: string) {
    if (input.startDate > input.endDate) throw new HttpError(400, "排班周期结束日期不能早于开始日期");
    const days = Math.round((dateOnly(input.endDate).getTime() - dateOnly(input.startDate).getTime()) / 86_400_000) + 1;
    const expected = input.cycleType === "WEEK" ? 7 : 14;
    if (days !== expected) throw new HttpError(400, `${input.cycleType === "WEEK" ? "周" : "双周"}排班周期必须是 ${expected} 天`);
    try {
      const period = await this.db.$transaction(async (transaction) => {
        await lockStorePeriods(transaction, input.storeId);
        const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
        assertConfiguredCycleRange(input.startDate, input.startDate, input.endDate, settings, input.cycleType);
        const overlap = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: dateOnly(input.endDate) }, endDate: { gte: dateOnly(input.startDate) } } });
        if (overlap) throw new HttpError(409, "该门店已存在重叠的排班周期");
        return transaction.rosterPeriod.create({ data: { ...input, startDate: dateOnly(input.startDate), endDate: dateOnly(input.endDate), createdByAccountId: accountId } });
      });
      return serializePeriod(period);
    } catch (error) {
      if (isPeriodConstraintError(error)) throw new HttpError(409, "该门店已存在重叠的排班周期");
      throw error;
    }
  }

  async getPeriod(storeId: string, periodId: string) {
    const period = await this.db.rosterPeriod.findFirst({ where: { id: periodId, storeId } });
    if (!period) throw new HttpError(404, "未找到排班周期");
    return period;
  }

  async calendar(storeId: string, from: string, to: string) {
    const previousDate = shiftDate(dateOnly(from), -1);
    return this.db.$transaction(async (transaction) => {
      const periods = await this.periodRows(storeId, from, to, transaction);
      const [candidates, settings] = await Promise.all([
        transaction.shift.findMany({
          where: { storeId, date: { gte: previousDate, lte: dateOnly(to) } },
          include: shiftInclude,
          orderBy: [{ startAt: "asc" }, { id: "asc" }],
        }),
        transaction.rosterStoreSettings.findUnique({ where: { storeId }, select: { timezone: true } }),
      ]);
      if (candidates.length && !settings) throw new HttpError(409, "请先核对门店时区，再查看历史班次");
      const visibleStart = settings ? zonedClockToDate(from, "00:00", settings.timezone) : dateOnly(from);
      const shifts = candidates.filter((shift) => shift.date >= dateOnly(from) || shift.endAt > visibleStart);
      const periodIds = new Set(periods.map((period) => period.id));
      const carryoverPeriodIds = [...new Set(shifts.filter((shift) => shift.date < dateOnly(from) && !periodIds.has(shift.rosterPeriodId)).map((shift) => shift.rosterPeriodId))];
      const carryoverPeriods = carryoverPeriodIds.length
        ? await transaction.rosterPeriod.findMany({ where: { storeId, id: { in: carryoverPeriodIds } }, orderBy: { startDate: "asc" } })
        : [];
      return {
        storeId,
        from,
        to,
        periods: [...carryoverPeriods, ...periods].map(serializePeriod),
        shifts: shifts.map(serializeShift),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getShift(storeId: string, shiftId: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, storeId }, include: shiftInclude });
    if (!shift) throw new HttpError(404, "Shift not found");
    return serializeShift(shift);
  }

  listRoles(storeId: string, includeInactive = false) {
    return this.db.shiftRole.findMany({
      where: { ...(includeInactive ? {} : { isActive: true }), OR: [{ storeId: null }, { storeId }] },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { nameZh: "asc" }],
    });
  }

  async listDraftRoleUsage(storeId: string) {
    const usage = await this.db.shift.groupBy({
      by: ["shiftRoleId"],
      where: { storeId, rosterPeriod: { status: "DRAFT" } },
      _count: { _all: true },
      _min: { date: true },
    });
    if (!usage.length) return [];
    const roles = await this.db.shiftRole.findMany({
      where: { id: { in: usage.map((item) => item.shiftRoleId) } },
      select: { id: true, code: true, nameZh: true, isActive: true },
    });
    const roleById = new Map(roles.map((role) => [role.id, role]));
    return usage.flatMap((item) => {
      const role = roleById.get(item.shiftRoleId);
      return role && item._min.date ? [{ ...role, shiftCount: item._count._all, firstDate: toDateString(item._min.date) }] : [];
    }).sort((left, right) => left.firstDate.localeCompare(right.firstDate) || left.nameZh.localeCompare(right.nameZh, "zh-CN"));
  }

  listShiftTemplates(storeId: string) {
    return this.db.shiftTemplate.findMany({ where: { storeId }, include: { shiftRole: true }, orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }] });
  }

  async createShiftTemplate(input: { storeId: string; name: string; startTime: string; endTime: string; breakMinutes: number; shiftRoleId?: string | null; displayOrder?: number }) {
    validateClockRange(input.startTime, input.endTime, input.breakMinutes);
    if (input.shiftRoleId) await this.requireRole(input.storeId, input.shiftRoleId);
    try {
      return await this.db.shiftTemplate.create({ data: { ...input, name: input.name.trim(), shiftRoleId: input.shiftRoleId || null, displayOrder: input.displayOrder ?? 0 }, include: { shiftRole: true } });
    } catch (error) { if (isUniqueError(error)) throw new HttpError(409, "该门店已存在同名班次模板"); throw error; }
  }

  async updateShiftTemplate(templateId: string, input: { storeId: string; name: string; startTime: string; endTime: string; breakMinutes: number; shiftRoleId?: string | null; isActive: boolean; displayOrder: number; version: number }) {
    validateClockRange(input.startTime, input.endTime, input.breakMinutes);
    if (input.shiftRoleId) {
      if (input.isActive) await this.requireRole(input.storeId, input.shiftRoleId);
      else {
        const existing = await this.db.shiftTemplate.findFirst({ where: { id: templateId, storeId: input.storeId, version: input.version }, select: { shiftRoleId: true } });
        if (!existing) throw new HttpError(409, "模板已被其他人更新或不存在，请刷新后重试");
        if (existing.shiftRoleId !== input.shiftRoleId) throw new HttpError(400, "停用模板时不能改绑旧岗位，请先移除岗位关联");
      }
    }
    try {
      return await this.db.shiftTemplate.update({
        where: { id: templateId, storeId: input.storeId, version: input.version },
        data: { name: input.name.trim(), startTime: input.startTime, endTime: input.endTime, breakMinutes: input.breakMinutes, shiftRoleId: input.shiftRoleId || null, isActive: input.isActive, displayOrder: input.displayOrder, version: { increment: 1 } },
        include: { shiftRole: true },
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new HttpError(409, "模板已被其他人更新或不存在，请刷新后重试");
      if (isUniqueError(error)) throw new HttpError(409, "该门店已存在同名班次模板");
      throw error;
    }
  }

  listAvailabilityTemplates(storeId: string) {
    return this.db.availabilityTemplate.findMany({ where: { storeId }, orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }] });
  }

  async createAvailabilityTemplate(input: { storeId: string; name: string; slots: Prisma.InputJsonValue; displayOrder?: number }) {
    try { return await this.db.availabilityTemplate.create({ data: { storeId: input.storeId, name: input.name.trim(), slots: input.slots, displayOrder: input.displayOrder ?? 0 } }); }
    catch (error) { if (isUniqueError(error)) throw new HttpError(409, "该门店已存在同名可用时间模板"); throw error; }
  }

  async updateAvailabilityTemplate(templateId: string, input: { storeId: string; name: string; slots: Prisma.InputJsonValue; isActive: boolean; displayOrder: number; version: number }) {
    try {
      return await this.db.availabilityTemplate.update({
        where: { id: templateId, storeId: input.storeId, version: input.version },
        data: { name: input.name.trim(), slots: input.slots, isActive: input.isActive, displayOrder: input.displayOrder, version: { increment: 1 } },
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new HttpError(409, "可用时间模板已被其他人更新或不存在，请刷新后重试");
      if (isUniqueError(error)) throw new HttpError(409, "该门店已存在同名可用时间模板");
      throw error;
    }
  }

  async createRole(input: { storeId: string; code: string; nameZh: string; colorToken: string; requiredSkillCodes: string[]; displayOrder?: number }, formalJobs: FormalJob[]) {
    const code = input.code.trim().toLowerCase();
    const name = input.nameZh.trim();
    const job = formalJobs.find((item) => item.isActive && item.code === code && item.name === name);
    if (!job) throw new HttpError(422, "岗位必须与 Evaluate 当前门店的正式岗位清单一致");
    try { return await this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const roles = await transaction.shiftRole.findMany({ where: { OR: [{ storeId: input.storeId }, { storeId: null }] },
        select: { id: true, storeId: true, isActive: true, code: true, nameZh: true } });
      if (matchFormalRoles(formalJobs, roles, input.storeId).jobRoleIds[job.id]) {
        throw new HttpError(409, "该正式岗位已有排班岗位关联，请使用现有关联以保留历史草稿");
      }
      return transaction.shiftRole.create({ data: { ...input, code, nameZh: name, displayOrder: input.displayOrder ?? 0 } });
    }); }
    catch (error) { if (isUniqueError(error)) throw new HttpError(409, "该门店已存在相同岗位代码"); throw error; }
  }

  async updateRole(roleId: string, input: { storeId: string; nameZh: string; colorToken: string; requiredSkillCodes: string[]; isActive: boolean; displayOrder: number; version: number }, formalJobs?: FormalJob[]) {
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      if (!input.isActive) {
        const current = await transaction.shiftRole.findFirst({ where: { id: roleId, storeId: input.storeId }, select: { isActive: true, version: true } });
        if (current?.isActive && current.version === input.version) {
          const draftShift = await transaction.shift.findFirst({ where: { storeId: input.storeId, shiftRoleId: roleId,
            rosterPeriod: { status: "DRAFT" } }, select: { id: true } });
          if (draftShift) throw new HttpError(409, "该岗位仍被草稿班次使用，请先将这些班次改派到当前正式岗位，再停用此岗位");
        }
      }
      if (input.isActive && formalJobs) {
        const roles = await transaction.shiftRole.findMany({ where: { OR: [{ storeId: input.storeId }, { storeId: null }] },
          select: { id: true, storeId: true, isActive: true, code: true, nameZh: true } });
        if (roles.some((role) => role.id === roleId && role.storeId === input.storeId)) {
          const association = assertRoleAssociationUnchanged(formalJobs, roles, input.storeId, roleId, input.nameZh);
          if (association === "INVALID") throw new HttpError(422, "岗位必须匹配 Evaluate 当前门店的正式岗位名称和唯一排班岗位");
          if (association === "TAKEN") throw new HttpError(409, "该正式岗位已有排班岗位关联，请使用现有关联以保留历史草稿");
        }
      }
      const updated = await transaction.shiftRole.updateMany({ where: { id: roleId, storeId: input.storeId, version: input.version }, data: { nameZh: input.nameZh.trim(), colorToken: input.colorToken, requiredSkillCodes: input.requiredSkillCodes, isActive: input.isActive, displayOrder: input.displayOrder, version: { increment: 1 } } });
      if (!updated.count) throw new HttpError(409, "岗位已被其他人更新、是系统岗位或不存在，请刷新后重试");
      return transaction.shiftRole.findUniqueOrThrow({ where: { id: roleId } });
    });
  }

  getSettings(storeId: string) {
    return this.db.rosterStoreSettings.findUnique({ where: { storeId } });
  }

  async getPresetShortcuts(storeId: string) {
    const saved = await this.db.availabilityScriptShortcuts.findUnique({ where: { storeId } });
    return saved ? { storeId, shortcuts: normalizePresetShortcuts(saved.shortcuts), version: saved.version } : null;
  }

  async savePresetShortcuts(input: { storeId: string; shortcuts: PresetShortcut[]; version?: number; actorAccountId: string }) {
    const shortcuts = normalizePresetShortcuts(input.shortcuts);
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const existing = await transaction.availabilityScriptShortcuts.findUnique({ where: { storeId: input.storeId } });
      if (existing ? input.version !== existing.version : input.version !== undefined) {
        throw new SchedulingError(409, { code: "STALE_VERSION", message: "快捷码已由其他管理员更新，请刷新后重试" });
      }
      if (!existing) {
        const created = await transaction.availabilityScriptShortcuts.create({ data: {
          storeId: input.storeId, shortcuts, updatedByAccountId: input.actorAccountId,
        } });
        return { storeId: input.storeId, shortcuts, version: created.version };
      }
      const changed = await transaction.availabilityScriptShortcuts.updateMany({
        where: { storeId: input.storeId, version: existing.version },
        data: { shortcuts, updatedByAccountId: input.actorAccountId, version: { increment: 1 } },
      });
      if (!changed.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "快捷码已由其他管理员更新，请刷新后重试" });
      return { storeId: input.storeId, shortcuts, version: existing.version + 1 };
    });
  }

  async saveSettings(input: { storeId: string; timezone: string; openingTime: string; closingTime: string; slotIntervalMinutes: number; minimumShiftMinutes: number; defaultBreakMinutes: number; weekStartsOn: number; cycleType: RosterCycleType; fortnightAnchorDate?: string | null; weeklyHourWarning: number; dailyHourWarning: number; version?: number }) {
    if (input.openingTime === input.closingTime) throw new HttpError(400, "营业开始与结束时间不能相同");
    validateTimeZone(input.timezone);
    if (input.minimumShiftMinutes < input.slotIntervalMinutes) throw new HttpError(400, "最短班次不能短于时间粒度");
    if (input.defaultBreakMinutes >= input.minimumShiftMinutes) throw new HttpError(400, "默认休息时间必须短于最短班次");
    const fortnightAnchorDate = input.cycleType === "FORTNIGHT" ? input.fortnightAnchorDate ?? null : null;
    if (input.cycleType === "FORTNIGHT" && !fortnightAnchorDate) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "选择双周排班时，请先设置双周起始日期" });
    if (fortnightAnchorDate && (!isCalendarDate(fortnightAnchorDate) || dateOnly(fortnightAnchorDate).getUTCDay() !== input.weekStartsOn)) {
      throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "双周起始日期必须是门店设置的周起始日" });
    }
    const clockMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const openingMinutes = clockMinutes(input.openingTime);
    const closingMinutes = clockMinutes(input.closingTime);
    const operatingMinutes = (closingMinutes - openingMinutes + 1440) % 1440;
    if (input.minimumShiftMinutes > operatingMinutes) throw new HttpError(400, `最短班次不能长于门店营业时段（${operatingMinutes} 分钟）`);
    const { version, ...rest } = input;
    const data = { ...rest, fortnightAnchorDate };
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const existing = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      if (existing && version !== existing.version) throw new SchedulingError(409, { code: "STALE_VERSION", message: "设置已被其他人更新，请刷新后重试" });
      if (fortnightAnchorDate && fortnightAnchorDate !== existing?.fortnightAnchorDate) {
        const fortnightPeriods = await transaction.rosterPeriod.findMany({ where: { storeId: input.storeId, cycleType: "FORTNIGHT" }, select: { startDate: true } });
        if (fortnightPeriods.some((period) => Math.abs(Math.round((period.startDate.getTime() - dateOnly(fortnightAnchorDate).getTime()) / 86_400_000)) % 14 !== 0)) {
          throw new SchedulingError(409, { code: "INVALID_TIME_RANGE", message: "现有双周排班与新起始日期不一致，请先处理已有周期" });
        }
      }
      if (input.timezone !== (existing?.timezone ?? "Australia/Sydney")) {
        const [shifts, availability] = await Promise.all([
          transaction.shift.count({ where: { storeId: input.storeId } }),
          transaction.employeeAvailability.count({ where: { storeId: input.storeId } }),
        ]);
        if (shifts || availability) throw new SchedulingError(409, { code: "STORE_TIMEZONE_LOCKED", message: "门店已有班次或可用时间，不能直接更改时区；请先迁移现有排班数据" });
      }
      if (!existing) return transaction.rosterStoreSettings.create({ data });
      const updated = await transaction.rosterStoreSettings.updateMany({ where: { storeId: input.storeId, version }, data: { ...data, version: { increment: 1 } } });
      if (!updated.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "设置已被其他人更新，请刷新后重试" });
      return transaction.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: input.storeId } });
    });
  }

  async listAvailability(storeId: string, from: string, to: string, employeeId?: string) {
    const rows = await this.db.employeeAvailability.findMany({
      where: { storeId, employeeId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
      orderBy: [{ date: "asc" }, { employeeId: "asc" }, { startAt: "asc" }],
    });
    return rows.map(serializeAvailability);
  }

  async listAssignedShiftsForPresetPreview(storeId: string, slots: ScriptSlot[]) {
    if (!slots.length) return [];
    const dates = [...new Set(slots.flatMap((slot) => [slot.date,
      toDateString(shiftDate(dateOnly(slot.date), -1)),
      toDateString(shiftDate(dateOnly(slot.date), 1))]))];
    const assignments = await this.db.shiftAssignment.findMany({ where: {
      employeeId: { in: [...new Set(slots.map((slot) => slot.employeeId))] },
      shift: { storeId, date: { in: dates.map(dateOnly) } },
    }, select: { employeeId: true, shift: { select: { date: true, startAt: true, endAt: true } } } });
    return assignments.map((assignment) => ({ employeeId: assignment.employeeId,
      date: toDateString(assignment.shift.date), startAt: assignment.shift.startAt.toISOString(),
      endAt: assignment.shift.endAt.toISOString() }));
  }

  async replaceAvailability(input: { storeId: string; employeeId: string; dates: string[]; entries: Array<{ date: string; status: AvailabilityStatus; startAt?: string | null; endAt?: string | null; note?: string | null; source?: AvailabilitySource }>; expectedRows?: Array<{ id: string; version: number }> }) {
    const dates = [...new Set(input.dates)];
    const dateSet = new Set(dates);
    const entriesByDate = new Map<string, typeof input.entries>();
    for (const entry of input.entries) {
      if (entry.status === "UNKNOWN" && (entry.startAt != null || entry.endAt != null)) {
        throw new HttpError(400, "未知可用时间不能包含开始或结束时间");
      }
      entriesByDate.set(entry.date, [...(entriesByDate.get(entry.date) ?? []), entry]);
    }
    if ([...entriesByDate.values()].some((entries) => entries.some((entry) => entry.status === "UNKNOWN") && entries.length !== 1)) {
      throw new HttpError(400, "同一天的未知可用时间不能与其他时段并存或重复");
    }
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      const timezone = settings?.timezone;
      const rows = input.entries.map((entry) => {
      if (!dateSet.has(entry.date)) throw new HttpError(400, "可用时间日期不在本次替换范围内");
      const startAt = entry.startAt ? new Date(entry.startAt) : null;
      const endAt = entry.endAt ? new Date(entry.endAt) : null;
      if (entry.status === "UNKNOWN") return { ...entry, startAt: null, endAt: null };
      if (!startAt || !endAt || !(startAt < endAt)) throw new HttpError(400, "可用时间的结束时间必须晚于开始时间");
      if (!timezone) throw new HttpError(409, "请先在设置中保存门店时区，再设置可用时间");
      const localStart = localDateTime(startAt, timezone);
      const localEnd = localDateTime(endAt, timezone);
      if (localStart.date !== entry.date) throw new SchedulingError(400, { code: "INVALID_AVAILABILITY_DATE", employeeId: input.employeeId, start: startAt.toISOString(), end: endAt.toISOString(), message: "可用时间的开始日期必须与门店本地日期一致" });
      const nextDate = toDateString(shiftDate(dateOnly(entry.date), 1));
      if ((localEnd.date !== entry.date && localEnd.date !== nextDate)
        || endAt.getTime() - startAt.getTime() > 86_400_000) {
        throw new SchedulingError(400, { code: "INVALID_AVAILABILITY_RANGE", employeeId: input.employeeId, start: startAt.toISOString(), end: endAt.toISOString(), message: "可用时间最多结束于次日，且最长为 24 小时" });
      }
      return { ...entry, startAt, endAt };
    });
      if (!settings && rows.length) throw new HttpError(409, "请先在设置中保存门店时区，再设置可用时间");
      await lockEmployees(transaction, input.storeId, [input.employeeId]);
      if (input.expectedRows) {
        const existingRows = await transaction.employeeAvailability.findMany({
          where: { storeId: input.storeId, employeeId: input.employeeId, date: { in: dates.map(dateOnly) } },
          select: { id: true, version: true },
        });
        const expected = input.expectedRows.map((row) => `${row.id}:${row.version}`).sort();
        const actual = existingRows.map((row) => `${row.id}:${row.version}`).sort();
        if (expected.length !== actual.length || expected.some((row, index) => row !== actual[index])) {
          throw new SchedulingError(409, { code: "STALE_VERSION", employeeId: input.employeeId, storeId: input.storeId, message: "可用时间已被其他人修改，请刷新后核对再保存" });
        }
      }
      const timedRows = rows.filter((row) => row.startAt && row.endAt);
      if (timedRows.length) {
        const firstStart = timedRows.reduce((first, row) => row.startAt! < first ? row.startAt! : first, timedRows[0]!.startAt!);
        const lastEnd = timedRows.reduce((last, row) => row.endAt! > last ? row.endAt! : last, timedRows[0]!.endAt!);
        const retained = await transaction.employeeAvailability.findMany({ where: {
          storeId: input.storeId, employeeId: input.employeeId, date: { notIn: dates.map(dateOnly) },
          startAt: { lt: lastEnd }, endAt: { gt: firstStart },
        } });
        const intervals = [...timedRows, ...retained].sort((left, right) => left.startAt!.getTime() - right.startAt!.getTime());
        let latestEnd = intervals[0]!.endAt!;
        for (const interval of intervals.slice(1)) {
          if (interval.startAt! < latestEnd) throw new HttpError(400, "可用时间段不能重叠，包括跨日时段");
          if (interval.endAt! > latestEnd) latestEnd = interval.endAt!;
        }
      }
      const affectedStartDates = [...new Set([...dates, ...dates.map((value) => toDateString(shiftDate(dateOnly(value), -1))), ...dates.map((value) => toDateString(shiftDate(dateOnly(value), 1)))])];
      const assigned = await transaction.shiftAssignment.findMany({
        where: { employeeId: input.employeeId, shift: { storeId: input.storeId, date: { in: affectedStartDates.map(dateOnly) } } },
        select: { employeeNameSnapshot: true, shift: { select: { date: true, startAt: true, endAt: true } } },
      });
      for (const assignment of assigned) {
        const shiftDateValue = toDateString(assignment.shift.date);
        const previousShiftDate = toDateString(shiftDate(assignment.shift.date, -1));
        const nextShiftDate = toDateString(shiftDate(assignment.shift.date, 1));
        const relevantDates = [previousShiftDate, shiftDateValue, nextShiftDate];
        if (!relevantDates.some((value) => dateSet.has(value))) continue;
        const retained = await transaction.employeeAvailability.findMany({ where: { storeId: input.storeId, employeeId: input.employeeId, date: { in: relevantDates.filter((value) => !dateSet.has(value)).map(dateOnly) } } });
        const replacement = [...retained, ...rows.filter((row) => relevantDates.includes(row.date))];
        if (!isCoveredByAvailability(replacement, assignment.shift.startAt, assignment.shift.endAt)) {
          throw new SchedulingError(422, {
            code: "EMPLOYEE_UNAVAILABLE", employeeId: input.employeeId, employeeName: assignment.employeeNameSnapshot,
            start: assignment.shift.startAt.toISOString(), end: assignment.shift.endAt.toISOString(),
            message: `${assignment.employeeNameSnapshot} 已排班 ${assignment.shift.startAt.toISOString()}–${assignment.shift.endAt.toISOString()}；请先调整班次再修改可用时间`,
          });
        }
      }
      await transaction.employeeAvailability.deleteMany({ where: { storeId: input.storeId, employeeId: input.employeeId, date: { in: dates.map(dateOnly) } } });
      if (rows.length) await transaction.employeeAvailability.createMany({ data: rows.map((entry) => ({
        storeId: input.storeId,
        employeeId: input.employeeId,
        date: dateOnly(entry.date),
        status: entry.status,
        startAt: entry.startAt,
        endAt: entry.endAt,
        note: cleanNote(entry.note),
        source: entry.source ?? "MANUAL",
      })) });
      const saved = await transaction.employeeAvailability.findMany({ where: { storeId: input.storeId, employeeId: input.employeeId, date: { in: dates.map(dateOnly) } }, orderBy: [{ date: "asc" }, { startAt: "asc" }] });
      return saved.map(serializeAvailability);
    });
  }

  async commitPresetTimeSlots(input: { storeId: string; actorAccountId: string; sourceHash: string; weekStart: string;
    expectedShortcutsVersion: number | null; expectedSettingsVersion: number | null; slots: ScriptSlot[];
    expectedCreateCount?: number; expectedUnchangedCount?: number; expectedSlotStatusHash: string }) {
    if (!input.slots.length) throw new HttpError(400, "脚本没有可导入的时间段");
    if (overlappingScriptSlotIndexes(input.slots).size) {
      throw new SchedulingError(422, { code: "INVALID_AVAILABILITY_RANGE", message: "同一员工的导入时段相互重叠，请调整跨日快捷码后重新预览" });
    }
    const distinctDays = new Set(input.slots.map((slot) => `${slot.employeeId}:${slot.date}`));
    if (distinctDays.size !== input.slots.length) {
      throw new SchedulingError(422, { code: "INVALID_AVAILABILITY_RANGE", message: "同一员工每天只能导入一条可用时间，请调整重复日期后重新预览" });
    }
    const employeeIds = [...new Set(input.slots.map((slot) => slot.employeeId))];
    const lastDate = toDateString(shiftDate(dateOnly(input.weekStart), 6));
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      const configuration = await transaction.availabilityScriptShortcuts.findUnique({ where: { storeId: input.storeId } });
      if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再导入可用时间脚本");
      if ((settings?.version ?? null) !== input.expectedSettingsVersion
        || (configuration?.version ?? null) !== input.expectedShortcutsVersion) {
        throw new SchedulingError(409, { code: "STALE_VERSION", message: "门店设置或脚本快捷码已变化，请重新预览" });
      }
      await lockEmployees(transaction, input.storeId, employeeIds);
      const previousImport = await transaction.availabilityScriptImport.findUnique({
        where: { storeId_sourceHash: { storeId: input.storeId, sourceHash: input.sourceHash } },
      });
      if (previousImport) {
        const current = await transaction.employeeAvailability.findMany({ where: {
          storeId: input.storeId, employeeId: { in: employeeIds },
          date: { gte: dateOnly(input.weekStart), lte: dateOnly(lastDate) },
        } });
        const intact = input.slots.every((slot) => {
          const onDate = current.filter((row) => row.employeeId === slot.employeeId && toDateString(row.date) === slot.date);
          return onDate.length === 1 && onDate[0]!.status === "AVAILABLE"
            && onDate[0]!.startAt?.toISOString() === slot.startAt && onDate[0]!.endAt?.toISOString() === slot.endAt;
        });
        if (!intact) throw new SchedulingError(409, { code: "STALE_VERSION", message: "此脚本曾导入，但可用时间随后已变化，请重新预览" });
        return { importId: previousImport.id, alreadyImported: true,
          created: previousImport.createdCount, unchanged: previousImport.unchangedCount };
      }
      const timezone = settings.timezone;
      for (const slot of input.slots) {
        if (slot.date < input.weekStart || slot.date > lastDate || slot.employeeId.length === 0) {
          throw new HttpError(400, "脚本日期或员工无效，请重新预览");
        }
        const localStart = localDateTime(new Date(slot.startAt), timezone);
        const localEnd = localDateTime(new Date(slot.endAt), timezone);
        const nextDate = toDateString(shiftDate(dateOnly(slot.date), 1));
        const startAt = new Date(slot.startAt);
        const endAt = new Date(slot.endAt);
        if (localStart.date !== slot.date || (localEnd.date !== slot.date && localEnd.date !== nextDate)
          || !(startAt < endAt) || endAt.getTime() - startAt.getTime() > 86_400_000) {
          throw new SchedulingError(409, { code: "STALE_VERSION", message: "门店时区或脚本时间已变化，请重新预览" });
        }
      }
      const from = shiftDate(dateOnly(input.weekStart), -1);
      const to = shiftDate(dateOnly(lastDate), 1);
      const existing = await transaction.employeeAvailability.findMany({ where: {
        storeId: input.storeId, employeeId: { in: employeeIds }, date: { gte: from, lte: to },
      } });
      const create: ScriptSlot[] = [];
      const reviewedStatuses: PresetSlotReview[] = [];
      let unchanged = 0;
      for (const slot of input.slots) {
        const sameDate = existing.filter((row) => row.employeeId === slot.employeeId && toDateString(row.date) === slot.date);
        if (sameDate.length === 1 && sameDate[0]!.status === "AVAILABLE"
          && sameDate[0]!.startAt?.toISOString() === slot.startAt && sameDate[0]!.endAt?.toISOString() === slot.endAt) {
          reviewedStatuses.push({ ...slot, status: "UNCHANGED", existingRows: [{ id: sameDate[0]!.id, version: sameDate[0]!.version }] });
          unchanged += 1; continue;
        }
        if (sameDate.length) throw new SchedulingError(409, { code: "STALE_VERSION", employeeId: slot.employeeId,
          message: `${slot.employeeName} ${slot.date} 已有可用时间，请重新预览；不会覆盖原记录` });
        const startAt = new Date(slot.startAt);
        const endAt = new Date(slot.endAt);
        if (existing.some((row) => row.employeeId === slot.employeeId && row.startAt && row.endAt
          && intervalsOverlap(row.startAt, row.endAt, startAt, endAt))) {
          throw new SchedulingError(409, { code: "STALE_VERSION", employeeId: slot.employeeId,
            message: `${slot.employeeName} ${slot.date} 与跨日可用时间重叠，请重新预览` });
        }
        reviewedStatuses.push({ ...slot, status: "CREATE", existingRows: [] });
        create.push(slot);
      }
      if ((input.expectedCreateCount !== undefined || input.expectedUnchangedCount !== undefined)
        && (create.length !== input.expectedCreateCount || unchanged !== input.expectedUnchangedCount)) {
        throw new SchedulingError(409, { code: "STALE_VERSION", message: "预览后的可用时间记录已变化，请重新预览" });
      }
      if (presetTimeSlotReviewFingerprint(reviewedStatuses) !== input.expectedSlotStatusHash) {
        throw new SchedulingError(409, { code: "STALE_VERSION", message: "预览的具体新增与不变时段已变化，请重新预览" });
      }
      const relevantShiftDates = [...new Set(create.flatMap((slot) => [slot.date,
        toDateString(shiftDate(dateOnly(slot.date), -1)),
        toDateString(shiftDate(dateOnly(slot.date), 1))]))].map(dateOnly);
      if (relevantShiftDates.length) {
        const assignments = await transaction.shiftAssignment.findMany({ where: {
          employeeId: { in: employeeIds }, shift: { storeId: input.storeId, date: { in: relevantShiftDates } },
        }, select: { employeeId: true, employeeNameSnapshot: true,
          shift: { select: { date: true, startAt: true, endAt: true } } } });
        const newWindows = create.map((slot) => ({ employeeId: slot.employeeId, status: "AVAILABLE" as const,
          startAt: new Date(slot.startAt), endAt: new Date(slot.endAt) }));
        for (const assignment of assignments) {
          const shiftDate = toDateString(assignment.shift.date);
          if (!create.some((slot) => slot.employeeId === assignment.employeeId
            && (slot.date === shiftDate || intervalsOverlap(new Date(slot.startAt), new Date(slot.endAt),
              assignment.shift.startAt, assignment.shift.endAt)))) continue;
          const windows = [...existing, ...newWindows].filter((row) => row.employeeId === assignment.employeeId);
          if (!isCoveredByAvailability(windows, assignment.shift.startAt, assignment.shift.endAt)) {
            throw new SchedulingError(422, { code: "EMPLOYEE_UNAVAILABLE", employeeId: assignment.employeeId,
              employeeName: assignment.employeeNameSnapshot, message: `${assignment.employeeNameSnapshot} 已有班次不在导入后的可用时间内` });
          }
        }
      }
      if (create.length) await transaction.employeeAvailability.createMany({ data: create.map((slot) => ({
        storeId: input.storeId, employeeId: slot.employeeId, date: dateOnly(slot.date),
        status: "AVAILABLE", startAt: new Date(slot.startAt), endAt: new Date(slot.endAt), source: "SCRIPT",
      })) });
      const audit = await transaction.availabilityScriptImport.create({ data: {
        storeId: input.storeId, actorAccountId: input.actorAccountId, sourceHash: input.sourceHash,
        weekStart: dateOnly(input.weekStart), mode: "APPEND", createdCount: create.length, unchangedCount: unchanged,
      } });
      return { importId: audit.id, alreadyImported: false, created: create.length, unchanged };
    }, { timeout: 20_000 });
  }

  async createShift(input: ShiftMutation, accountId: string) {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "班次结束时间必须晚于开始时间" });
    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    if (input.breakMinutes < 0 || input.breakMinutes >= durationMinutes) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于班次时长" });
    const [period, role, settings] = await Promise.all([
      this.db.rosterPeriod.findFirst({ where: { id: input.rosterPeriodId, storeId: input.storeId } }),
      this.db.shiftRole.findFirst({ where: { id: input.shiftRoleId, isActive: true, OR: [{ storeId: null }, { storeId: input.storeId }] } }),
      this.db.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } }),
    ]);
    if (!period) throw new HttpError(404, "未找到排班周期");
    assertPeriodShape(period);
    if (input.date < toDateString(period.startDate) || input.date > toDateString(period.endDate)) throw new HttpError(400, "班次日期不在排班周期内");
    if (!role) throw new HttpError(400, "所选岗位不存在或已停用");
    if (!input.assignments.length) throw new HttpError(400, "请至少选择一名员工");
    validateShiftAgainstSettings(settings, input.date, startAt, endAt, durationMinutes);
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const currentPeriod = await transaction.rosterPeriod.findFirst({ where: { id: period.id, storeId: input.storeId } });
      if (!currentPeriod) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "排班周期不存在，请刷新后重试" });
      assertPeriodShape(currentPeriod);
      if (!shiftBelongsToPeriod({ storeId: input.storeId, date: dateOnly(input.date) }, currentPeriod)) {
        throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "排班周期日期已变化，班次不再属于该周期；请刷新后重试" });
      }
      const currentRole = await requireCurrentShiftRole(transaction, input.storeId, input.shiftRoleId);
      const currentSettings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      validateShiftAgainstSettings(currentSettings, input.date, startAt, endAt, durationMinutes);
      await lockEmployees(transaction, input.storeId, input.assignments.map((assignment) => assignment.employeeId));
      await assertAssignmentsAvailable(transaction, input.storeId, input.date, startAt, endAt, input.assignments);
      const concurrentConflict = await transaction.shiftAssignment.findFirst({ where: { employeeId: { in: input.assignments.map((assignment) => assignment.employeeId) }, shift: { startAt: { lt: endAt }, endAt: { gt: startAt } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
      if (concurrentConflict) throw conflictError(concurrentConflict, input.storeId);
      const shift = await transaction.shift.create({
        data: {
          rosterPeriodId: currentPeriod.id, storeId: input.storeId, date: dateOnly(input.date), startAt, endAt,
          breakMinutes: input.breakMinutes, shiftRoleId: currentRole.id, roleNameSnapshot: input.formalRoleName ?? currentRole.nameZh,
          roleColorSnapshot: input.formalRoleColor ?? currentRole.colorToken, publicNote: cleanNote(input.publicNote), internalNote: cleanNote(input.internalNote),
          createdByAccountId: accountId, updatedByAccountId: accountId,
          assignments: { create: assignmentRows(input.assignments) },
        },
        include: shiftInclude,
      });
      await transaction.rosterPeriod.update({ where: { id: currentPeriod.id }, data: { version: { increment: 1 } } });
      return shift;
    }).then(serializeShift);
  }

  async replayShiftWithPeriod(input: CreateReplayInput, accountId: string) {
    if (!input.clientShiftId) return null;
    const previousRequest = await this.db.shiftCreateRequest.findUnique({ where: { id: input.clientShiftId } });
    if (!previousRequest) return null;
    if (previousRequest.storeId !== input.storeId || previousRequest.accountId !== accountId || previousRequest.payloadHash !== createShiftPayloadHash(input)) {
      throw new SchedulingError(409, { code: "CREATE_REPLAY_CONFLICT", message: "该新建请求已用于其他班次内容，请刷新日历后重新创建" });
    }
    const previous = await this.db.shift.findFirst({ where: { id: previousRequest.shiftId, storeId: input.storeId }, include: shiftInclude });
    if (!previous) throw new SchedulingError(409, { code: "CREATE_REPLAY_GONE", message: "该新建请求的班次已被删除，不会重新创建；请刷新日历后核对" });
    return serializeShift(previous);
  }

  async createShiftWithPeriod(input: Omit<ShiftMutation, "rosterPeriodId"> & { targetStartDate: string; targetEndDate: string; clientShiftId?: string }, accountId: string) {
    const replayInput = { ...input, employeeIds: input.assignments.map((item) => item.employeeId) };
    const replay = await this.replayShiftWithPeriod(replayInput, accountId);
    if (replay) return replay;
    const payloadHash = input.clientShiftId ? createShiftPayloadHash(replayInput) : null;
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", start: input.startAt, end: input.endAt, message: "结束时间必须晚于开始时间" });
    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    if (input.breakMinutes < 0 || input.breakMinutes >= durationMinutes) throw new SchedulingError(400, { code: "INVALID_BREAK", start: input.startAt, end: input.endAt, message: "休息时间必须短于班次时长" });
    if (input.date < input.targetStartDate || input.date > input.targetEndDate) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "目标日期必须位于排班周期内" });
    const [role, settings] = await Promise.all([
      this.db.shiftRole.findFirst({ where: { id: input.shiftRoleId, isActive: true, OR: [{ storeId: null }, { storeId: input.storeId }] } }),
      this.db.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } }),
    ]);
    if (!role) throw new HttpError(400, "所选岗位不存在或已停用");
    if (!input.assignments.length) throw new HttpError(400, "请至少选择一名员工");
    validateShiftAgainstSettings(settings, input.date, startAt, endAt, durationMinutes);
    try { return await this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      if (input.clientShiftId) {
        const previousRequest = await transaction.shiftCreateRequest.findUnique({ where: { id: input.clientShiftId } });
        if (previousRequest) {
          if (previousRequest.storeId !== input.storeId || previousRequest.accountId !== accountId || previousRequest.payloadHash !== payloadHash) {
            throw new SchedulingError(409, { code: "CREATE_REPLAY_CONFLICT", message: "该新建请求已用于其他班次内容，请刷新日历后重新创建" });
          }
          const previous = await transaction.shift.findFirst({ where: { id: previousRequest.shiftId, storeId: input.storeId }, include: shiftInclude });
          if (!previous) throw new SchedulingError(409, { code: "CREATE_REPLAY_GONE", message: "该新建请求的班次已被删除，不会重新创建；请刷新日历后核对" });
          return serializeShift(previous);
        }
      }
      const period = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: dateOnly(input.date) }, endDate: { gte: dateOnly(input.date) } } });
      if (period) assertPeriodShape(period);
      const currentRole = await requireCurrentShiftRole(transaction, input.storeId, input.shiftRoleId);
      const currentSettings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      const targetCycle = !period ? assertConfiguredCycleRange(input.date, input.targetStartDate, input.targetEndDate, currentSettings) : null;
      validateShiftAgainstSettings(currentSettings, input.date, startAt, endAt, durationMinutes);
      await lockEmployees(transaction, input.storeId, input.assignments.map((item) => item.employeeId));
      await assertAssignmentsAvailable(transaction, input.storeId, input.date, startAt, endAt, input.assignments);
      const conflict = await transaction.shiftAssignment.findFirst({ where: { employeeId: { in: input.assignments.map((item) => item.employeeId) }, shift: { startAt: { lt: endAt }, endAt: { gt: startAt } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
      if (conflict) throw conflictError(conflict, input.storeId);
      const destination = period ?? await transaction.rosterPeriod.create({ data: { storeId: input.storeId, startDate: dateOnly(targetCycle!.startDate), endDate: dateOnly(targetCycle!.endDate), cycleType: targetCycle!.cycleType, createdByAccountId: accountId } });
      const shift = await transaction.shift.create({ data: { id: input.clientShiftId, rosterPeriodId: destination.id, storeId: input.storeId, date: dateOnly(input.date), startAt, endAt, breakMinutes: input.breakMinutes, shiftRoleId: currentRole.id, roleNameSnapshot: input.formalRoleName ?? currentRole.nameZh, roleColorSnapshot: input.formalRoleColor ?? currentRole.colorToken, publicNote: cleanNote(input.publicNote), internalNote: cleanNote(input.internalNote), createdByAccountId: accountId, updatedByAccountId: accountId, assignments: { create: assignmentRows(input.assignments) } }, include: shiftInclude });
      if (input.clientShiftId) await transaction.shiftCreateRequest.create({ data: { id: input.clientShiftId, storeId: input.storeId, accountId, shiftId: shift.id, payloadHash: payloadHash! } });
      await transaction.rosterPeriod.update({ where: { id: destination.id }, data: { version: { increment: 1 } } });
      return serializeShift(shift);
    }); }
    catch (error) { if (isPeriodConstraintError(error)) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标日期已存在不兼容的排班周期，请刷新后重试" }); throw error; }
  }

  async updateShift(shiftId: string, input: ShiftMutation & { version: number }, accountId: string) {
    const values = await this.validateShiftMutation(input);
    const current = await this.db.shift.findFirst({ where: { id: shiftId, storeId: input.storeId }, select: { rosterPeriodId: true } });
    if (!current) throw new HttpError(404, "未找到班次");
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      await lockEmployees(transaction, input.storeId, input.assignments.map((assignment) => assignment.employeeId));
      const latest = await transaction.shift.findFirst({ where: { id: shiftId, storeId: input.storeId }, select: { version: true, rosterPeriodId: true, rosterPeriod: { select: { status: true } } } });
      if (!latest) throw new HttpError(404, "未找到班次");
      if (latest.version !== input.version) throw new SchedulingError(409, { code: "STALE_VERSION", shiftId, message: "班次已被其他人更新，请刷新后重试" });
      const targetPeriod = await transaction.rosterPeriod.findFirst({ where: { id: values.period.id, storeId: input.storeId } });
      const currentRole = await requireCurrentShiftRole(transaction, input.storeId, input.shiftRoleId);
      validateShiftAgainstSettings(await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } }), input.date, values.startAt, values.endAt, (values.endAt.getTime() - values.startAt.getTime()) / 60_000);
      if (!targetPeriod) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", shiftId, message: "目标排班周期不存在，请刷新后重试" });
      assertPeriodShape(targetPeriod);
      if (!shiftBelongsToPeriod({ storeId: input.storeId, date: dateOnly(input.date) }, targetPeriod)) {
        throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", shiftId, message: "目标排班周期日期已变化，班次不再属于该周期；请刷新后重试" });
      }
      await assertAssignmentsAvailable(transaction, input.storeId, input.date, values.startAt, values.endAt, input.assignments);
      const concurrentConflict = await transaction.shiftAssignment.findFirst({ where: { employeeId: { in: input.assignments.map((assignment) => assignment.employeeId) }, shift: { id: { not: shiftId }, startAt: { lt: values.endAt }, endAt: { gt: values.startAt } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
      if (concurrentConflict) throw conflictError(concurrentConflict, input.storeId);
      const locked = await transaction.shift.updateMany({
        where: { id: shiftId, storeId: input.storeId, version: input.version },
        data: { version: { increment: 1 }, updatedByAccountId: accountId },
      });
      if (!locked.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "班次已被其他人更新，请刷新后重试" });
      await transaction.shiftAssignment.deleteMany({ where: { shiftId } });
      const shift = await transaction.shift.update({
        where: { id: shiftId },
        data: {
          rosterPeriodId: values.period.id,
          date: dateOnly(input.date),
          startAt: values.startAt,
          endAt: values.endAt,
          breakMinutes: input.breakMinutes,
          shiftRoleId: currentRole.id,
          roleNameSnapshot: input.formalRoleName ?? currentRole.nameZh,
          roleColorSnapshot: input.formalRoleColor ?? currentRole.colorToken,
          publicNote: cleanNote(input.publicNote),
          internalNote: cleanNote(input.internalNote),
          assignments: { create: assignmentRows(input.assignments) },
        },
        include: shiftInclude,
      });
      await transaction.rosterPeriod.update({ where: { id: values.period.id }, data: { version: { increment: 1 } } });
      if (latest.rosterPeriodId !== values.period.id) await transaction.rosterPeriod.update({ where: { id: latest.rosterPeriodId }, data: { version: { increment: 1 } } });
      return shift;
    }).then(serializeShift);
  }

  async repositionShift(shiftId: string, input: { storeId: string; date: string; startAt: string; endAt: string; version: number; targetStartDate: string; targetEndDate: string }, accountId: string, activeEmployeeIds: string[], replacement?: { sourceEmployeeId: string; target: AssignmentSnapshot }, formalRoleNames?: Record<string, string>, qualified?: RoleQualifications, formalRoleColors?: Record<string, string>) {
    const activeEmployees = new Set(activeEmployeeIds);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "班次结束时间必须晚于开始时间" });
    if (input.date < input.targetStartDate || input.date > input.targetEndDate) throw new HttpError(400, "目标日期不在排班周期内");
    try { return await this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, input.storeId);
      const shift = await transaction.shift.findFirst({ where: { id: shiftId, storeId: input.storeId }, include: { assignments: true, rosterPeriod: true } });
      if (!shift) throw new HttpError(404, "未找到班次");
      if (shift.version !== input.version) throw new SchedulingError(409, { code: "STALE_VERSION", message: "班次已被其他人更新，请刷新后重试" });
      const currentRole = await requireCurrentShiftRole(transaction, input.storeId, shift.shiftRoleId);
      if (formalRoleNames && !formalRoleNames[shift.shiftRoleId]) {
        throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", shiftId: shift.id, message: `岗位 ${shift.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中，请先更换岗位` });
      }
      if (replacement && (shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== replacement.sourceEmployeeId || replacement.sourceEmployeeId === replacement.target.employeeId)) {
        throw new SchedulingError(409, { code: "STALE_VERSION", message: "班次员工分配已变化，请刷新后重试" });
      }
      if (replacement && !activeEmployees.has(replacement.target.employeeId)) {
        throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: replacement.target.employeeId, storeId: input.storeId, message: "目标员工已归档或不属于当前门店，不能移动班次" });
      }
      const assignments = replacement ? [replacement.target] : shift.assignments;
      assertRoleAssignmentsQualified(shift.shiftRoleId, assignments, qualified, shift.id);
      const ineligible = assignments.find((assignment) => !activeEmployees.has(assignment.employeeId));
      if (ineligible) throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: ineligible.employeeId, employeeName: ineligible.employeeNameSnapshot, storeId: input.storeId, message: `${ineligible.employeeNameSnapshot} 已归档或不属于当前门店，不能移动班次` });
      const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
      validateShiftAgainstSettings(settings, input.date, startAt, endAt, durationMinutes);
      if (settings) {
        const aligned = (value: Date) => {
          const time = localDateTime(value, settings.timezone).time;
          return (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) % settings.slotIntervalMinutes === 0;
        };
        if (!aligned(startAt) || !aligned(endAt)) throw new SchedulingError(400, { code: "INVALID_SLOT_ALIGNMENT", start: input.startAt, end: input.endAt, message: `移动和缩放须对齐 ${settings.slotIntervalMinutes} 分钟时间粒度`, metadata: { slotIntervalMinutes: settings.slotIntervalMinutes } });
      }
      if (shift.breakMinutes >= durationMinutes) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于班次时长" });
      await lockEmployees(transaction, input.storeId, [...shift.assignments.map((item) => item.employeeId), ...assignments.map((item) => item.employeeId)]);
      await assertAssignmentsAvailable(transaction, input.storeId, input.date, startAt, endAt, assignments);
      const conflict = await transaction.shiftAssignment.findFirst({ where: { employeeId: { in: assignments.map((item) => item.employeeId) }, shift: { id: { not: shiftId }, startAt: { lt: endAt }, endAt: { gt: startAt } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
      if (conflict) throw conflictError(conflict, input.storeId);
      let period = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: dateOnly(input.date) }, endDate: { gte: dateOnly(input.date) } } });
      if (period) assertPeriodShape(period);
      if (!period) {
        const targetCycle = assertConfiguredCycleRange(input.date, input.targetStartDate, input.targetEndDate, settings);
        period = await transaction.rosterPeriod.create({ data: { storeId: input.storeId, startDate: dateOnly(targetCycle.startDate), endDate: dateOnly(targetCycle.endDate), cycleType: targetCycle.cycleType, createdByAccountId: accountId } });
      }
      const updated = await transaction.shift.updateMany({ where: { id: shiftId, storeId: input.storeId, version: input.version }, data: {
        rosterPeriodId: period.id, date: dateOnly(input.date), startAt, endAt,
        roleNameSnapshot: formalRoleNames?.[shift.shiftRoleId] ?? currentRole.nameZh, roleColorSnapshot: formalRoleColors?.[shift.shiftRoleId] ?? currentRole.colorToken,
        version: { increment: 1 }, updatedByAccountId: accountId,
      } });
      if (!updated.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "班次已被其他人更新，请刷新后重试" });
      if (replacement) {
        await transaction.shiftAssignment.deleteMany({ where: { shiftId, employeeId: replacement.sourceEmployeeId } });
        await transaction.shiftAssignment.create({ data: { shiftId, ...assignmentRows([replacement.target])[0]! } });
      }
      await transaction.rosterPeriod.update({ where: { id: period.id }, data: { version: { increment: 1 } } });
      if (period.id !== shift.rosterPeriodId) await transaction.rosterPeriod.update({ where: { id: shift.rosterPeriodId }, data: { version: { increment: 1 } } });
      return serializeShift(await transaction.shift.findUniqueOrThrow({ where: { id: shiftId }, include: shiftInclude }));
    }); }
    catch (error) {
      if (isPeriodConstraintError(error)) throw new HttpError(409, "目标日期已存在不兼容的排班周期，请刷新后重试");
      throw error;
    }
  }

  async deleteShift(shiftId: string, storeId: string, version: number) {
    await this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, storeId);
      const shift = await transaction.shift.findFirst({ where: { id: shiftId, storeId }, include: { rosterPeriod: { select: { status: true } } } });
      if (!shift) throw new HttpError(404, "未找到班次");
      const deleted = await transaction.shift.deleteMany({ where: { id: shiftId, storeId, version } });
      if (!deleted.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "班次已被其他人更新，请刷新后重试" });
      await transaction.rosterPeriod.update({ where: { id: shift.rosterPeriodId }, data: { version: { increment: 1 } } });
    });
  }

  /** Commit one draft period atomically. The caller resolves current workforce snapshots before this call. */
  async commitDraftPeriod(storeId: string, periodId: string, changes: DraftCommitChange[], accountId: string, existingTransaction?: Prisma.TransactionClient) {
    if (!changes.length) throw new HttpError(400, "没有待提交的班次");
    const touchedIds = changes.filter((change) => change.kind !== "create").map((change) => change.shiftId);
    const createdIds = changes.filter((change) => change.kind === "create").map((change) => change.clientShiftId);
    if (new Set(touchedIds).size !== touchedIds.length || new Set(createdIds).size !== createdIds.length || createdIds.some((id) => touchedIds.includes(id))) {
      throw new HttpError(400, "同一班次不能在本次提交中重复操作");
    }
    const apply = async (transaction: Prisma.TransactionClient) => {
      await lockStorePeriods(transaction, storeId);
      const period = await transaction.rosterPeriod.findFirst({ where: { id: periodId, storeId } });
      if (!period) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "排班周期不存在，请刷新后重试" });
      assertPeriodShape(period);
      const existing = await transaction.shift.findMany({ where: { storeId, id: { in: touchedIds } }, include: { assignments: true } });
      if (existing.length !== touchedIds.length) throw new SchedulingError(409, { code: "STALE_VERSION", message: "部分班次已不存在，请刷新后重试" });
      const existingById = new Map(existing.map((shift) => [shift.id, shift]));
      for (const change of changes) {
        if (change.kind === "create") continue;
        const shift = existingById.get(change.shiftId)!;
        if (shift.rosterPeriodId !== periodId || shift.version !== change.baseVersion) {
          throw new SchedulingError(409, { code: "STALE_VERSION", shiftId: change.shiftId, message: "班次或所属周期已变化，请刷新后重试" });
        }
      }
      if (createdIds.length && (await transaction.shift.count({ where: { id: { in: createdIds } } })
        || await transaction.shiftCreateRequest.count({ where: { id: { in: createdIds } } }))) {
        throw new SchedulingError(409, { code: "CREATE_REPLAY_CONFLICT", message: "新增班次 ID 已存在，请刷新日历核对提交结果" });
      }
      const incoming = changes.filter((change): change is Extract<DraftCommitChange, { kind: "create" | "update" }> => change.kind !== "delete");
      const oldEmployeeIds = existing.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId));
      await lockEmployees(transaction, storeId, [...oldEmployeeIds, ...incoming.flatMap((change) => change.value.assignments.map((assignment) => assignment.employeeId))]);
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId } });
      const roleIds = [...new Set(incoming.map((change) => change.value.shiftRoleId))];
      const roles = await transaction.shiftRole.findMany({ where: { id: { in: roleIds }, isActive: true, OR: [{ storeId: null }, { storeId }] } });
      const rolesById = new Map(roles.map((role) => [role.id, role]));
      const prepared = [] as Array<{ change: (typeof incoming)[number]; startAt: Date; endAt: Date }>;
      for (const change of incoming) {
        const value = change.value;
        const startAt = new Date(value.startAt);
        const endAt = new Date(value.endAt);
        if (!(startAt < endAt)) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "结束时间必须晚于开始时间" });
        const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
        if (value.breakMinutes < 0 || value.breakMinutes >= durationMinutes) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于班次时长" });
        if (value.date < toDateString(period.startDate) || value.date > toDateString(period.endDate)) throw new HttpError(400, "班次日期不在排班周期内");
        if (!rolesById.has(value.shiftRoleId)) throw new SchedulingError(422, { code: "INACTIVE_SHIFT_ROLE", message: "岗位已停用或不属于当前门店" });
        if (!value.assignments.length || new Set(value.assignments.map((assignment) => assignment.employeeId)).size !== value.assignments.length) throw new HttpError(400, "员工不能为空或重复");
        validateShiftAgainstSettings(settings, value.date, startAt, endAt, durationMinutes);
        await assertAssignmentsAvailable(transaction, storeId, value.date, startAt, endAt, value.assignments);
        const conflict = await transaction.shiftAssignment.findFirst({ where: { employeeId: { in: value.assignments.map((assignment) => assignment.employeeId) }, shift: { id: { notIn: touchedIds }, startAt: { lt: endAt }, endAt: { gt: startAt } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
        if (conflict) throw conflictError(conflict, storeId);
        for (const prior of prepared) {
          if (prior.startAt < endAt && startAt < prior.endAt && value.assignments.some((assignment) => prior.change.value.assignments.some((other) => other.employeeId === assignment.employeeId))) {
            throw new SchedulingError(409, { code: "SHIFT_OVERLAP", message: "本次提交的班次之间存在员工时间重叠" });
          }
        }
        prepared.push({ change, startAt, endAt });
      }
      for (const change of changes) {
        if (change.kind !== "delete") continue;
        const deleted = await transaction.shift.deleteMany({ where: { id: change.shiftId, storeId, rosterPeriodId: periodId, version: change.baseVersion } });
        if (!deleted.count) throw new SchedulingError(409, { code: "STALE_VERSION", shiftId: change.shiftId, message: "班次已变化，请刷新后重试" });
      }
      const updateIds = changes.filter((change) => change.kind === "update").map((change) => change.shiftId);
      if (updateIds.length) await transaction.shiftAssignment.deleteMany({ where: { shiftId: { in: updateIds } } });
      const saved = [] as Array<ReturnType<typeof serializeShift>>;
      for (const { change, startAt, endAt } of prepared) {
        const value = change.value;
        const role = rolesById.get(value.shiftRoleId)!;
        const data = { date: dateOnly(value.date), startAt, endAt, breakMinutes: value.breakMinutes, shiftRoleId: role.id,
          roleNameSnapshot: value.formalRoleName ?? role.nameZh, roleColorSnapshot: value.formalRoleColor ?? role.colorToken,
          publicNote: cleanNote(value.publicNote), internalNote: cleanNote(value.internalNote), updatedByAccountId: accountId,
          assignments: { create: assignmentRows(value.assignments) } };
        if (change.kind === "create") {
          saved.push(serializeShift(await transaction.shift.create({ data: { ...data, id: change.clientShiftId, storeId, rosterPeriodId: periodId, createdByAccountId: accountId }, include: shiftInclude })));
        } else {
          const locked = await transaction.shift.updateMany({ where: { id: change.shiftId, storeId, rosterPeriodId: periodId, version: change.baseVersion }, data: { version: { increment: 1 } } });
          if (!locked.count) throw new SchedulingError(409, { code: "STALE_VERSION", shiftId: change.shiftId, message: "班次已变化，请刷新后重试" });
          saved.push(serializeShift(await transaction.shift.update({ where: { id: change.shiftId }, data, include: shiftInclude })));
        }
      }
      await transaction.rosterPeriod.update({ where: { id: periodId }, data: { version: { increment: 1 } } });
      return { saved, deletedIds: changes.filter((change) => change.kind === "delete").map((change) => change.shiftId) };
    };
    try { return existingTransaction ? await apply(existingTransaction) : await this.db.$transaction(apply, { timeout: 20_000 }); }
    catch (error) { if (isPeriodConstraintError(error)) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标周期冲突，请刷新后重试" }); throw error; }
  }

  async agentCalendarToken(storeId:string,from:string,to:string) {
    return this.db.$transaction(async(tx)=>(await agentCalendarState(tx,storeId,from,to)).token,{isolationLevel:'RepeatableRead'});
  }

  async agentApplicationReceipt(storeId:string,runId:string,accountId:string) {
    const rows=await this.db.shiftCreateRequest.findMany({where:{storeId,accountId,OR:[{payloadHash:{startsWith:'agent-v1:'+runId+':'}},{payloadHash:{startsWith:'agent-empty-v1:'+runId+':'}}]}});
    const generated=rows.filter(r=>r.payloadHash.startsWith('agent-v1:'));
    return rows.length?{applied:true,alreadyApplied:true,created:generated.length,deleted:0,shiftIds:generated.map(r=>r.shiftId)}:null;
  }

  async applyAgentCalendar(plan:AgentCalendarPlan,accountId:string) {
    const applyDates=plan.applyDates?new Set(plan.applyDates):null;
    if(applyDates&&(!applyDates.size||[...applyDates].some(d=>!isCalendarDate(d)||d<plan.from||d>plan.to)
      ||plan.shifts.some(s=>!applyDates.has(s.value.date))))throw new HttpError(422,'可写日期与验证班次不一致');
    const generated=plan.shifts.filter(s=>!s.fixed);
    const ids=generated.map(s=>agentShiftId(plan.runId,s.key));
    const requestIds=ids.length?ids:[agentShiftId(plan.runId,'EMPTY_RESULT_RECEIPT')];
    const payloadHash=(ids.length?'agent-v1:':'agent-empty-v1:')+plan.runId+':'+createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    return this.db.$transaction(async(tx)=>{
      await lockStorePeriods(tx,plan.storeId);
      const requests=await tx.shiftCreateRequest.findMany({where:{id:{in:requestIds}}});
      if(requests.length){
        if(requests.length!==requestIds.length || requests.some(r=>r.storeId!==plan.storeId || r.accountId!==accountId || r.payloadHash!==payloadHash))
          throw new HttpError(409,'该任务的写入记录不一致，不能重复应用');
        return {applied:true,alreadyApplied:true,created:ids.length,deleted:0,shiftIds:ids};
      }
      const current=await agentCalendarState(tx,plan.storeId,plan.from,plan.to);
      if(current.token!==plan.expectedToken)throw new SchedulingError(409,{code:'STALE_VERSION',message:'排班期间日历已被修改，未覆盖当前班次；请重新生成'});
      const receiptRows=requestIds.map(id=>({id,shiftId:id,storeId:plan.storeId,accountId,payloadHash}));
      if(!plan.shifts.length&&!current.shifts.length){
        await tx.shiftCreateRequest.createMany({data:receiptRows});
        return {applied:true,alreadyApplied:false,created:0,deleted:0,shiftIds:[]};
      }
      if(current.periods.length>1)throw new HttpError(409,'目标周跨越多个现有周期，请先核对周期范围');
      const settings=await tx.rosterStoreSettings.findUnique({where:{storeId:plan.storeId}});
      if(!settings)throw new HttpError(409,'请先保存门店时区和营业时间');
      const cycle=configuredCycleRange(plan.from,settings);
      const period=current.periods[0] ?? await tx.rosterPeriod.create({data:{storeId:plan.storeId,startDate:dateOnly(cycle.startDate),endDate:dateOnly(cycle.endDate),cycleType:cycle.cycleType,createdByAccountId:accountId}});
      if(plan.from<toDateString(period.startDate)||plan.to>toDateString(period.endDate))throw new HttpError(409,'排班周不完整地落在目标周期内');
      const kept=new Set(plan.shifts.filter(s=>s.fixed).map(s=>s.sourceShiftId));
      if(plan.shifts.some(s=>s.value.date<plan.from||s.value.date>plan.to))throw new HttpError(422,'候选班次超出本次排班周');
      for(const fixed of plan.shifts.filter(s=>s.fixed)) {
        const row=current.shifts.find(s=>s.id===fixed.sourceShiftId);
        if(!row || row.startAt.toISOString()!==new Date(fixed.value.startAt).toISOString() || row.endAt.toISOString()!==new Date(fixed.value.endAt).toISOString() || row.shiftRoleId!==fixed.value.shiftRoleId)
          throw new HttpError(409,'候选中沿用的班次已变化');
      }
      const deleted=plan.preserveExisting?[]:current.shifts.filter(s=>!kept.has(s.id)&&(!applyDates||applyDates.has(toDateString(s.date))));
      const changes:DraftCommitChange[]=[...deleted.map(s=>({kind:'delete' as const,shiftId:s.id,baseVersion:s.version})),
        ...generated.map((s,i)=>({kind:'create' as const,clientShiftId:ids[i],value:s.value}))];
      if(!changes.length){
        await tx.shiftCreateRequest.createMany({data:receiptRows});
        return {applied:true,alreadyApplied:false,created:0,deleted:0,shiftIds:[]};
      }
      const auditDirectory=resolve(process.env.MULTI_AGENT_AUDIT_DIR||'.data/agent-calendar-audit');
      await mkdir(auditDirectory,{recursive:true});
      try {await writeFile(join(auditDirectory,plan.runId+'.json'),JSON.stringify({runId:plan.runId,storeId:plan.storeId,from:plan.from,to:plan.to,accountId,
        createdAt:new Date().toISOString(),before:current,generatedIds:ids},null,2),{encoding:'utf8',flag:'wx',mode:0o600});}
      catch(error){if(!(error instanceof Error && 'code' in error && error.code==='EEXIST'))throw error;}
      await this.commitDraftPeriod(plan.storeId,period.id,changes,accountId,tx);
      await tx.shiftCreateRequest.createMany({data:receiptRows});
      return {applied:true,alreadyApplied:false,created:ids.length,deleted:deleted.length,shiftIds:ids};
    },{timeout:30_000});
  }

  async periodSummary(storeId: string, periodId: string) {
    const { period, shifts } = await this.db.$transaction(async (transaction) => {
      const period = await transaction.rosterPeriod.findFirst({ where: { id: periodId, storeId } });
      if (!period) throw new HttpError(404, "未找到排班周期");
      const shifts = await transaction.shift.findMany({ where: { storeId, rosterPeriodId: periodId }, include: shiftInclude, orderBy: { startAt: "asc" } });
      return { period, shifts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const employeeHours = new Map<string, { employeeId: string; name: string; hours: number }>();
    const roleHours = new Map<string, { role: string; hours: number }>();
    let totalHours = 0;
    for (const shift of shifts) {
      const net = Math.max(0, (shift.endAt.getTime() - shift.startAt.getTime()) / 3_600_000 - shift.breakMinutes / 60);
      totalHours += net * shift.assignments.length;
      const role = roleHours.get(shift.shiftRoleId) ?? { role: shift.roleNameSnapshot, hours: 0 }; role.hours += net * shift.assignments.length; roleHours.set(shift.shiftRoleId, role);
      for (const assignment of shift.assignments) { const current = employeeHours.get(assignment.employeeId) ?? { employeeId: assignment.employeeId, name: assignment.employeeNameSnapshot, hours: 0 }; current.hours += net; employeeHours.set(assignment.employeeId, current); }
    }
    return { period: serializePeriod(period), shiftCount: shifts.length, assignmentCount: shifts.reduce((sum, shift) => sum + shift.assignments.length, 0), totalHours, employeeHours: [...employeeHours.values()].sort((a, b) => b.hours - a.hours), roleHours: [...roleHours.values()].sort((a, b) => b.hours - a.hours) };
  }

  async publishPeriod(storeId: string, periodId: string, version: number, publisher: { accountId: string; displayName: string }, store: { id: string; name: string }, currentEmployees: AssignmentSnapshot[], formalRoleIds?: string[], formalRoleNames?: Record<string, string>, qualified?: RoleQualifications, formalRoleColors?: Record<string, string>) {
    const currentById = new Map(currentEmployees.map((employee) => [employee.employeeId, employee]));
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, storeId);
      const period = await transaction.rosterPeriod.findFirst({ where: { id: periodId, storeId }, include: { shifts: { include: shiftInclude, orderBy: { startAt: "asc" } } } });
      if (!period) throw new HttpError(404, "未找到排班周期");
      if (period.status !== "DRAFT") throw new SchedulingError(409, { code: "PERIOD_PUBLISHED", message: "该排班周期已经发布" });
      assertPeriodShape(period);
      if (period.version !== version) throw new SchedulingError(409, { code: "STALE_VERSION", message: "排班已被其他人更新，请刷新后重试" });
      if (!period.shifts.length) throw new HttpError(422, "空排班不能发布");
      if (period.shifts.some((shift) => !shift.assignments.length)) throw new HttpError(422, "存在未分配员工的班次，不能发布");
      const misplaced = period.shifts.find((shift) => !shiftBelongsToPeriod(shift, period));
      if (misplaced) throw shiftPeriodMismatchError(misplaced.id);
      const inactiveRole = period.shifts.find((shift) => !shift.shiftRole.isActive || (shift.shiftRole.storeId !== null && shift.shiftRole.storeId !== storeId));
      if (inactiveRole) throw new SchedulingError(422, { code: "INACTIVE_SHIFT_ROLE", shiftId: inactiveRole.id, message: `岗位 ${inactiveRole.roleNameSnapshot} 已停用或不属于当前门店，请先更换岗位` });
      const unverifiedRole = formalRoleIds && period.shifts.find((shift) => !formalRoleIds.includes(shift.shiftRoleId));
      if (unverifiedRole) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", shiftId: unverifiedRole.id, message: `岗位 ${unverifiedRole.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中，请先更换岗位` });
      const invalid = period.shifts.flatMap((shift) => shift.assignments).find((assignment) => !currentById.has(assignment.employeeId));
      if (invalid) throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: invalid.employeeId, employeeName: invalid.employeeNameSnapshot, storeId, message: `${invalid.employeeNameSnapshot} 已归档或不属于当前门店，不能发布排班` });
      for (const shift of period.shifts) assertRoleAssignmentsQualified(shift.shiftRoleId, shift.assignments, qualified, shift.id);
      const employeeIds = [...new Set(period.shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)))];
      await lockEmployees(transaction, storeId, employeeIds);
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId } });
      if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再发布排班");
      for (const shift of period.shifts) {
        validateShiftAgainstSettings(settings, toDateString(shift.date), shift.startAt, shift.endAt,
          (shift.endAt.getTime() - shift.startAt.getTime()) / 60_000);
      }
      const earliestStart = period.shifts[0]!.startAt;
      const latestEnd = period.shifts.reduce((latest, shift) => shift.endAt > latest ? shift.endAt : latest, period.shifts[0]!.endAt);
      const otherAssignments = await transaction.shiftAssignment.findMany({
        where: {
          employeeId: { in: employeeIds },
          shift: { rosterPeriodId: { not: periodId }, startAt: { lt: latestEnd }, endAt: { gt: earliestStart } },
        },
        select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } },
      });
      const otherShiftsByEmployee = new Map<string, typeof otherAssignments>();
      for (const assignment of otherAssignments) {
        const shifts = otherShiftsByEmployee.get(assignment.employeeId) ?? [];
        shifts.push(assignment);
        otherShiftsByEmployee.set(assignment.employeeId, shifts);
      }
      const availability = await transaction.employeeAvailability.findMany({
        where: {
          storeId,
          employeeId: { in: employeeIds },
          date: { gte: shiftDate(period.startDate, -1), lte: shiftDate(period.endDate, 1) },
        },
        select: { employeeId: true, status: true, startAt: true, endAt: true },
      });
      const availabilityByEmployee = new Map<string, AvailabilityWindow[]>();
      for (const row of availability) {
        const windows = availabilityByEmployee.get(row.employeeId) ?? [];
        windows.push(row);
        availabilityByEmployee.set(row.employeeId, windows);
      }
      const latestShiftByEmployee = new Map<string, (typeof period.shifts)[number]>();
      for (const shift of period.shifts) {
        for (const assignment of shift.assignments) {
          const externalConflict = otherShiftsByEmployee.get(assignment.employeeId)?.find((other) => intervalsOverlap(other.shift.startAt, other.shift.endAt, shift.startAt, shift.endAt));
          if (externalConflict) throw conflictError(externalConflict, storeId);
          const previous = latestShiftByEmployee.get(assignment.employeeId);
          if (previous && previous.endAt > shift.startAt) {
            throw conflictError({ employeeId: assignment.employeeId, employeeNameSnapshot: assignment.employeeNameSnapshot, shift: previous }, storeId);
          }
          latestShiftByEmployee.set(assignment.employeeId, shift);
          if (!isCoveredByAvailability(availabilityByEmployee.get(assignment.employeeId) ?? [], shift.startAt, shift.endAt)) {
            throw new SchedulingError(422, { code: "EMPLOYEE_UNAVAILABLE", employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, storeId, start: shift.startAt.toISOString(), end: shift.endAt.toISOString(), message: `${assignment.employeeNameSnapshot} 的可用时间未覆盖 ${shift.startAt.toISOString()}–${shift.endAt.toISOString()}，不能发布排班` });
          }
        }
      }
      const periodVersion = version + 1;
      const publishedAt = new Date();
      const snapshot: PublicationSnapshot = {
        schemaVersion: 1,
        store,
        timezone: settings.timezone,
        period: { id: period.id, storeId, startDate: toDateString(period.startDate), endDate: toDateString(period.endDate), cycleType: period.cycleType, status: "PUBLISHED", version: periodVersion },
        publishedBy: publisher,
        shifts: period.shifts.map((shift) => publicationShift(shift, currentById, formalRoleNames?.[shift.shiftRoleId], formalRoleColors?.[shift.shiftRoleId])),
      };
      // Freeze the current Evaluate color on the published Shift as well as the
      // immutable publication record. Earlier publications are never rewritten.
      for (const shift of period.shifts) {
        const color = formalRoleColors?.[shift.shiftRoleId];
        if (color && color !== shift.roleColorSnapshot) {
          await transaction.shift.update({ where: { id: shift.id }, data: { roleColorSnapshot: color } });
        }
      }
      const updated = await transaction.rosterPeriod.updateMany({ where: { id: periodId, storeId, version, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt, version: { increment: 1 } } });
      if (!updated.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "排班已被其他人更新，请刷新后重试" });
      const publication = await transaction.rosterPublication.create({ data: { rosterPeriodId: periodId, periodVersion, publishedByAccountId: publisher.accountId, publishedAt, snapshot: snapshot as unknown as Prisma.InputJsonValue } });
      const savedPeriod = await transaction.rosterPeriod.findUniqueOrThrow({ where: { id: periodId } });
      return { period: serializePeriod(savedPeriod), publication };
    });
  }

  async listPublications(storeId: string, periodId: string) {
    await this.getPeriod(storeId, periodId);
    const rows = await this.db.rosterPublication.findMany({ where: { rosterPeriodId: periodId }, include: { rosterPeriod: true }, orderBy: [{ publishedAt: "asc" }, { id: "asc" }] });
    return rows.map((row, index) => publicationSummary(row, normalizePublicationSnapshot(row.snapshot, row), index + 1)).reverse();
  }

  async getPublication(storeId: string, publicationId: string, audience: "employee" | "manager") {
    const row = await this.db.rosterPublication.findFirst({ where: { id: publicationId, rosterPeriod: { storeId } }, include: { rosterPeriod: true } });
    if (!row) throw new HttpError(404, "未找到发布记录");
    const snapshot = normalizePublicationSnapshot(row.snapshot, row);
    const revisionNumber = await this.db.rosterPublication.count({ where: { rosterPeriodId: row.rosterPeriodId,
      OR: [{ publishedAt: { lt: row.publishedAt } }, { publishedAt: row.publishedAt, id: { lte: row.id } }] } });
    return { ...publicationSummary(row, snapshot, revisionNumber), snapshot: audience === "manager" ? snapshot : employeeSafePublication(snapshot) };
  }

  async exportPublication(storeId: string, publicationId: string) {
    const row = await this.db.rosterPublication.findFirst({ where: { id: publicationId, rosterPeriod: { storeId } }, include: { rosterPeriod: true } });
    if (!row) throw new HttpError(404, "未找到发布记录");
    const snapshot = normalizePublicationSnapshot(row.snapshot, row);
    return { period: snapshot.period, shifts: snapshot.shifts, timezone: snapshot.timezone };
  }

  async reopenPeriod(storeId: string, periodId: string, version: number) {
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, storeId);
      const updated = await transaction.rosterPeriod.updateMany({ where: { id: periodId, storeId, version, status: "PUBLISHED" }, data: { status: "DRAFT", version: { increment: 1 } } });
      if (!updated.count) throw new SchedulingError(409, { code: "STALE_VERSION", message: "排班状态已变化，请刷新后重试" });
      return serializePeriod(await transaction.rosterPeriod.findFirstOrThrow({ where: { id: periodId, storeId } }));
    });
  }

  async previewCopyPeriod(input: { storeId: string; sourcePeriodId: string; targetStartDate: string; activeEmployeeIds: string[]; formalRoleIds?: string[]; qualified?: RoleQualifications }) {
    const source = await this.db.rosterPeriod.findFirst({ where: { id: input.sourcePeriodId, storeId: input.storeId }, include: { shifts: { include: shiftInclude } } });
    if (!source) throw new HttpError(404, "未找到来源排班周期");
    const sourceShapeValid = isValidPeriodShape(source);
    const dayCount = Math.round((source.endDate.getTime() - source.startDate.getTime()) / 86_400_000) + 1;
    const targetStart = dateOnly(input.targetStartDate);
    const targetEnd = shiftDate(targetStart, dayCount - 1);
    const dayOffset = Math.round((targetStart.getTime() - source.startDate.getTime()) / 86_400_000);
    const issues: Array<{ shiftDate: string; shiftId?: string; employeeId?: string; employeeName: string; code: string; severity: "BLOCKING_ERROR"; reason: string }> = [];
    const periodOverlap = await this.db.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: targetEnd }, endDate: { gte: targetStart } } });
    const settings = await this.db.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
    if (!settings && source.shifts.length) throw new HttpError(409, "请先在设置中保存门店时区，再预览复制排班");
    let targetCycleError: Error | null = null;
    try { assertConfiguredCycleRange(input.targetStartDate, input.targetStartDate, toDateString(targetEnd), settings, source.cycleType); }
    catch (cause) { targetCycleError = cause instanceof Error ? cause : new Error("目标周期无效"); }
    const employeeIds = [...new Set(source.shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)))];
    const [availability, existingAssignments] = await Promise.all([
      this.db.employeeAvailability.findMany({ where: { storeId: input.storeId, employeeId: { in: employeeIds }, date: { gte: shiftDate(targetStart, -1), lte: shiftDate(targetEnd, 1) } }, select: { employeeId: true, status: true, startAt: true, endAt: true } }),
      this.db.shiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, shift: { startAt: { lt: shiftDate(targetEnd, 3) }, endAt: { gt: shiftDate(targetStart, -1) } } }, select: { employeeId: true, shift: { select: { storeId: true, startAt: true, endAt: true } } } }),
    ]);
    const availabilityByEmployee = new Map<string, AvailabilityWindow[]>();
    for (const row of availability) {
      const windows = availabilityByEmployee.get(row.employeeId) ?? [];
      windows.push(row);
      availabilityByEmployee.set(row.employeeId, windows);
    }
    const existingByEmployee = new Map<string, typeof existingAssignments>();
    for (const assignment of existingAssignments) {
      const rows = existingByEmployee.get(assignment.employeeId) ?? [];
      rows.push(assignment);
      existingByEmployee.set(assignment.employeeId, rows);
    }
    const activeEmployeeIds = new Set(input.activeEmployeeIds);
    if (!source.shifts.length) issues.push({ shiftDate: input.targetStartDate, employeeName: "—", code: "NO_SOURCE_SHIFTS",
      severity: "BLOCKING_ERROR", reason: "来源周期没有可复制的班次" });
    if (!sourceShapeValid) issues.push({ shiftDate: input.targetStartDate, employeeName: "—", code: "INVALID_TIME_RANGE",
      severity: "BLOCKING_ERROR", reason: "来源排班周期长度与周或双周类型不符，请先修复数据" });
    if (targetCycleError) issues.push({ shiftDate: input.targetStartDate, employeeName: "—", code: "INVALID_TIME_RANGE",
      severity: "BLOCKING_ERROR", reason: targetCycleError.message });
    if (periodOverlap) issues.push({ shiftDate: input.targetStartDate, employeeName: "—", code: "TARGET_PERIOD_CONFLICT", severity: "BLOCKING_ERROR", reason: "目标日期已有排班周期" });
    let availableAssignments = 0;
    let unavailableAssignments = 0;
    let conflictingAssignments = 0;
    let structurallyBlockedAssignments = 0;
    let readyShifts = 0;
    const copiedWindows = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
    const copiedRanges = new Map<string, ReturnType<typeof copyShiftWallClock>>();
    for (const shift of source.shifts) {
      if (!sourceShapeValid || targetCycleError) { structurallyBlockedAssignments += shift.assignments.length; continue; }
      const issueCountBefore = issues.length;
      const date = toDateString(shiftDate(shift.date, dayOffset));
      if (!shiftBelongsToPeriod(shift, source)) {
        issues.push({ shiftDate: toDateString(shift.date), shiftId: shift.id, employeeName: "—", code: "SHIFT_PERIOD_MISMATCH",
          severity: "BLOCKING_ERROR", reason: "来源班次的门店或日期与所属排班周期不一致，请先修复数据" });
        structurallyBlockedAssignments += shift.assignments.length;
        continue;
      }
      if (!shift.shiftRole.isActive || (shift.shiftRole.storeId !== null && shift.shiftRole.storeId !== input.storeId)) {
        issues.push({ shiftDate: date, shiftId: shift.id, employeeName: "—", code: "INACTIVE_SHIFT_ROLE", severity: "BLOCKING_ERROR", reason: `岗位 ${shift.roleNameSnapshot} 已停用或不属于当前门店，请先更换岗位` });
        structurallyBlockedAssignments += shift.assignments.length;
        continue;
      }
      if (input.formalRoleIds && !input.formalRoleIds.includes(shift.shiftRoleId)) {
        issues.push({ shiftDate: date, shiftId: shift.id, employeeName: "—", code: "UNVERIFIED_SHIFT_ROLE", severity: "BLOCKING_ERROR", reason: `岗位 ${shift.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中` });
        structurallyBlockedAssignments += shift.assignments.length;
        continue;
      }
      let copied: ReturnType<typeof copyShiftWallClock> | null = null;
      try {
        copied = copyShiftWallClockCached(copiedRanges, shift, dayOffset, settings!.timezone);
        validateShiftAgainstSettings(settings, date, copied.startAt, copied.endAt, (copied.endAt.getTime() - copied.startAt.getTime()) / 60_000);
      } catch (cause) {
        issues.push({ shiftDate: date, shiftId: shift.id, employeeName: "—", code: cause instanceof SchedulingError ? cause.validation.code : "INVALID_TIME_RANGE", severity: "BLOCKING_ERROR", reason: cause instanceof Error ? cause.message : "目标日期的时间无效" });
        structurallyBlockedAssignments += shift.assignments.length;
        copied = null;
      }
      if (!copied) continue;
      const { startAt, endAt } = copied;
      if (!shift.assignments.length) {
        issues.push({ shiftDate: date, shiftId: shift.id, employeeName: "—", code: "INVALID_ASSIGNMENTS", severity: "BLOCKING_ERROR", reason: "来源班次没有员工分配" });
        continue;
      }
      for (const assignment of shift.assignments) {
        if (!activeEmployeeIds.has(assignment.employeeId)) {
          issues.push({ shiftDate: date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, code: "ARCHIVED_EMPLOYEE", severity: "BLOCKING_ERROR", reason: "员工已归档或不属于当前门店" });
          unavailableAssignments += 1; continue;
        }
        if (unqualifiedAssignment(shift.shiftRoleId, [assignment], input.qualified)) {
          issues.push({ shiftDate: date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot,
            code: "UNQUALIFIED_EMPLOYEE_ROLE", severity: "BLOCKING_ERROR", reason: "员工尚未获得该正式岗位授权" });
          unavailableAssignments += 1; continue;
        }
        if (!isCoveredByAvailability(availabilityByEmployee.get(assignment.employeeId) ?? [], startAt, endAt)) {
          issues.push({ shiftDate: date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, code: "EMPLOYEE_UNAVAILABLE", severity: "BLOCKING_ERROR", reason: "目标时间不在可用时段内" });
          unavailableAssignments += 1; continue;
        }
        const conflict = existingByEmployee.get(assignment.employeeId)?.find((item) => intervalsOverlap(item.shift.startAt, item.shift.endAt, startAt, endAt));
        if (conflict) {
          issues.push({ shiftDate: date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, code: conflict.shift.storeId === input.storeId ? "SHIFT_OVERLAP" : "CROSS_STORE_CONFLICT", severity: "BLOCKING_ERROR", reason: `已有${conflict.shift.storeId === input.storeId ? "本门店" : `其他门店 ${conflict.shift.storeId}`}班次 ${conflict.shift.startAt.toISOString()}–${conflict.shift.endAt.toISOString()}` });
          conflictingAssignments += 1; continue;
        }
        const employeeWindows = copiedWindows.get(assignment.employeeId) ?? [];
        if (employeeWindows.some((window) => intervalsOverlap(window.startAt, window.endAt, startAt, endAt))) {
          issues.push({ shiftDate: date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, code: "SHIFT_OVERLAP", severity: "BLOCKING_ERROR", reason: "复制后的班次与同一批次中该员工的另一班次重叠" });
          conflictingAssignments += 1; continue;
        }
        employeeWindows.push({ startAt, endAt });
        copiedWindows.set(assignment.employeeId, employeeWindows);
        availableAssignments += 1;
      }
      if (issues.length === issueCountBefore && !periodOverlap) readyShifts += 1;
    }
    return { policy: "ALL_OR_NOTHING" as const, shiftCount: source.shifts.length, readyShifts, availableAssignments, blockedAssignments: unavailableAssignments + conflictingAssignments + structurallyBlockedAssignments, unavailableAssignments, conflictingAssignments, issues, canCopy: issues.length === 0, targetStartDate: input.targetStartDate, sourcePeriodVersion: source.version };
  }

  async copyPeriod(input: { storeId: string; sourcePeriodId: string; targetStartDate: string; activeEmployeeIds: string[]; currentAssignments?: AssignmentSnapshot[]; formalRoleIds?: string[]; formalRoleNames?: Record<string, string>; formalRoleColors?: Record<string, string>; qualified?: RoleQualifications; expectedSourcePeriodVersion?: number }, accountId: string) {
    try {
      return await this.db.$transaction(async (transaction) => {
        await lockStorePeriods(transaction, input.storeId);
        const source = await transaction.rosterPeriod.findFirst({ where: { id: input.sourcePeriodId, storeId: input.storeId }, include: { shifts: { include: shiftInclude } } });
        if (!source) throw new HttpError(404, "未找到来源排班周期");
        assertPeriodShape(source);
        if (input.expectedSourcePeriodVersion !== undefined && source.version !== input.expectedSourcePeriodVersion) throw new SchedulingError(409, { code: "STALE_VERSION", message: "来源排班已被其他人修改，请重新检查复制预览" });
        if (!source.shifts.length) throw new HttpError(422, "来源周期没有可复制的班次");
        const misplaced = source.shifts.find((shift) => !shiftBelongsToPeriod(shift, source));
        if (misplaced) throw shiftPeriodMismatchError(misplaced.id);
        const unassigned = source.shifts.find((shift) => !shift.assignments.length);
        if (unassigned) throw new SchedulingError(422, { code: "INVALID_ASSIGNMENTS", shiftId: unassigned.id, message: "来源班次没有员工分配，不能复制" });
        const inactive = source.shifts.flatMap((shift) => shift.assignments).find((assignment) => !input.activeEmployeeIds.includes(assignment.employeeId));
        if (inactive) throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: inactive.employeeId, employeeName: inactive.employeeNameSnapshot, message: `${inactive.employeeNameSnapshot} 已归档或不属于当前门店，不能复制` });
        const inactiveRole = source.shifts.find((shift) => !shift.shiftRole.isActive || (shift.shiftRole.storeId !== null && shift.shiftRole.storeId !== input.storeId));
        if (inactiveRole) throw new SchedulingError(422, { code: "INACTIVE_SHIFT_ROLE", shiftId: inactiveRole.id, message: `岗位 ${inactiveRole.roleNameSnapshot} 已停用或不属于当前门店，请先更换岗位` });
        const formalRoleIds = input.formalRoleIds;
        const unverifiedRole = formalRoleIds && source.shifts.find((shift) => !formalRoleIds.includes(shift.shiftRoleId));
        if (unverifiedRole) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", shiftId: unverifiedRole.id, message: `岗位 ${unverifiedRole.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中` });
        for (const shift of source.shifts) assertRoleAssignmentsQualified(shift.shiftRoleId, shift.assignments, input.qualified, shift.id);
        const dayCount = Math.round((source.endDate.getTime() - source.startDate.getTime()) / 86_400_000) + 1;
        const targetStart = dateOnly(input.targetStartDate); const targetEnd = new Date(targetStart); targetEnd.setUTCDate(targetEnd.getUTCDate() + dayCount - 1);
        const dayOffset = Math.round((targetStart.getTime() - source.startDate.getTime()) / 86_400_000);
        const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
        if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再复制排班");
        assertConfiguredCycleRange(input.targetStartDate, input.targetStartDate, toDateString(targetEnd), settings, source.cycleType);
        await lockEmployees(transaction, input.storeId, source.shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)));
        const overlap = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: targetEnd }, endDate: { gte: targetStart } } });
        if (overlap) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标日期已存在排班周期，请先清理或选择其他日期" });
        const employeeIds = [...new Set(source.shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)))];
        const availability = await transaction.employeeAvailability.findMany({ where: { storeId: input.storeId, employeeId: { in: employeeIds }, date: { gte: shiftDate(targetStart, -1), lte: shiftDate(targetEnd, 1) } }, select: { employeeId: true, status: true, startAt: true, endAt: true } });
        const availabilityByEmployee = new Map<string, AvailabilityWindow[]>();
        for (const row of availability) {
          const windows = availabilityByEmployee.get(row.employeeId) ?? [];
          windows.push(row);
          availabilityByEmployee.set(row.employeeId, windows);
        }
        const existingAssignments = await transaction.shiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, shift: { startAt: { lt: shiftDate(targetEnd, 3) }, endAt: { gt: shiftDate(targetStart, -1) } } }, select: { employeeId: true, employeeNameSnapshot: true, shift: { select: { id: true, storeId: true, startAt: true, endAt: true } } } });
        const existingByEmployee = new Map<string, typeof existingAssignments>();
        for (const assignment of existingAssignments) {
          const rows = existingByEmployee.get(assignment.employeeId) ?? [];
          rows.push(assignment);
          existingByEmployee.set(assignment.employeeId, rows);
        }
        const copiedWindows = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
        const copiedRanges = new Map<string, ReturnType<typeof copyShiftWallClock>>();
        for (const shift of source.shifts) {
          const { date, startAt, endAt } = validatedCopyShiftWallClock(shift, dayOffset, settings.timezone, copiedRanges);
          validateShiftAgainstSettings(settings, date, startAt, endAt, (endAt.getTime() - startAt.getTime()) / 60_000);
          for (const assignment of shift.assignments) if (!isCoveredByAvailability(availabilityByEmployee.get(assignment.employeeId) ?? [], startAt, endAt)) {
            throw new SchedulingError(422, { code: "EMPLOYEE_UNAVAILABLE", employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, storeId: input.storeId, start: startAt.toISOString(), end: endAt.toISOString(), message: `${assignment.employeeNameSnapshot} 在 ${startAt.toISOString()}–${endAt.toISOString()} 没有覆盖整个班次的可用时间` });
          }
          const conflict = shift.assignments.flatMap((assignment) => existingByEmployee.get(assignment.employeeId) ?? [])
            .find((item) => intervalsOverlap(item.shift.startAt, item.shift.endAt, startAt, endAt));
          if (conflict) throw conflictError(conflict, input.storeId);
          for (const assignment of shift.assignments) {
            const employeeWindows = copiedWindows.get(assignment.employeeId) ?? [];
            if (employeeWindows.some((window) => intervalsOverlap(window.startAt, window.endAt, startAt, endAt))) {
              throw new SchedulingError(409, { code: "SHIFT_OVERLAP", employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, start: startAt.toISOString(), end: endAt.toISOString(), message: "复制后的班次与同一批次中该员工的另一班次重叠" });
            }
            employeeWindows.push({ startAt, endAt });
            copiedWindows.set(assignment.employeeId, employeeWindows);
          }
        }
        const period = await transaction.rosterPeriod.create({ data: { storeId: input.storeId, startDate: targetStart, endDate: targetEnd, cycleType: source.cycleType, createdByAccountId: accountId } });
        const currentById = input.currentAssignments ? new Map(input.currentAssignments.map((assignment) => [assignment.employeeId, assignment])) : null;
        const copiedShifts: Prisma.ShiftCreateManyInput[] = [];
        const copiedAssignments: Prisma.ShiftAssignmentCreateManyInput[] = [];
        for (const shift of source.shifts) {
          const copied = validatedCopyShiftWallClock(shift, dayOffset, settings.timezone, copiedRanges);
          const date = dateOnly(copied.date); const { startAt, endAt } = copied;
          const shiftId = randomUUID();
          copiedShifts.push({ id: shiftId, rosterPeriodId: period.id, storeId: input.storeId, date, startAt, endAt, breakMinutes: shift.breakMinutes, shiftRoleId: shift.shiftRoleId, roleNameSnapshot: input.formalRoleNames?.[shift.shiftRoleId] ?? shift.roleNameSnapshot, roleColorSnapshot: input.formalRoleColors?.[shift.shiftRoleId] ?? shift.shiftRole.colorToken, publicNote: shift.publicNote, internalNote: shift.internalNote, createdByAccountId: accountId, updatedByAccountId: accountId });
          copiedAssignments.push(...shift.assignments.map((assignment) => ({ shiftId, ...copyAssignmentSnapshot(assignment, currentById) })));
        }
        for (let offset = 0; offset < copiedShifts.length; offset += 500) await transaction.shift.createMany({ data: copiedShifts.slice(offset, offset + 500) });
        for (let offset = 0; offset < copiedAssignments.length; offset += 500) await transaction.shiftAssignment.createMany({ data: copiedAssignments.slice(offset, offset + 500) });
        return serializePeriod(period);
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      if (isPeriodConstraintError(error)) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标日期已存在排班周期，请先清理或选择其他日期" });
      throw error;
    }
  }

  async previewCopyDay(input: { storeId: string; sourceDate: string; targetDate: string; activeEmployeeIds: string[]; formalRoleIds?: string[]; qualified?: RoleQualifications }) {
    return this.db.$transaction(async (transaction) => (await inspectDayCopy(transaction, input)).preview);
  }

  async copyDay(input: { storeId: string; sourceDate: string; targetDate: string; activeEmployeeIds: string[]; currentAssignments?: AssignmentSnapshot[]; formalRoleIds?: string[]; formalRoleNames?: Record<string, string>; formalRoleColors?: Record<string, string>; qualified?: RoleQualifications; expectedTargetPeriodVersion?: number | null; expectedSourcePeriodVersion?: number | null }, accountId: string) {
    try {
      return await this.db.$transaction(async (transaction) => {
        await lockStorePeriods(transaction, input.storeId);
        const source = await transaction.shift.findMany({ where: { storeId: input.storeId, date: dateOnly(input.sourceDate) }, include: shiftInclude });
        await lockEmployees(transaction, input.storeId, source.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)));
        const { preview, plans, targetPeriod, settings, invalidPeriodShape } = await inspectDayCopy(transaction, input);
        if (input.expectedSourcePeriodVersion !== undefined && preview.sourcePeriodVersion !== input.expectedSourcePeriodVersion) {
          throw new SchedulingError(409, { code: "STALE_VERSION", message: "来源排班已被其他人修改，请重新检查复制预览" });
        }
        if (input.expectedTargetPeriodVersion !== undefined && (targetPeriod?.version ?? null) !== input.expectedTargetPeriodVersion) {
          throw new SchedulingError(409, { code: "STALE_VERSION", message: "目标排班已被其他人修改，请重新检查复制预览" });
        }
        if (!preview.canCopy) {
          const first = preview.issues[0]!;
          throw new SchedulingError(invalidPeriodShape || first.code === "TARGET_PERIOD_CONFLICT" || first.code === "SHIFT_OVERLAP" || first.code === "CROSS_STORE_CONFLICT" || first.code === "SHIFT_PERIOD_MISMATCH" ? 409 : 422, {
            code: first.code, employeeId: first.employeeId, employeeName: first.employeeName, shiftId: first.shiftId, message: first.reason,
          });
        }
        const cycle = !targetPeriod ? configuredCycleRange(input.targetDate, settings) : null;
        const period = targetPeriod ?? await transaction.rosterPeriod.create({ data: {
          storeId: input.storeId, startDate: dateOnly(cycle!.startDate), endDate: dateOnly(cycle!.endDate), cycleType: cycle!.cycleType, createdByAccountId: accountId,
        } });
        const currentById = input.currentAssignments ? new Map(input.currentAssignments.map((assignment) => [assignment.employeeId, assignment])) : null;
        const copiedShifts: Prisma.ShiftCreateManyInput[] = [];
        const copiedAssignments: Prisma.ShiftAssignmentCreateManyInput[] = [];
        for (const { shift, date, startAt, endAt } of plans) {
          const shiftId = randomUUID();
          copiedShifts.push({ id: shiftId, rosterPeriodId: period.id, storeId: input.storeId, date: dateOnly(date), startAt, endAt,
            breakMinutes: shift.breakMinutes, shiftRoleId: shift.shiftRoleId, roleNameSnapshot: input.formalRoleNames?.[shift.shiftRoleId] ?? shift.roleNameSnapshot,
            roleColorSnapshot: input.formalRoleColors?.[shift.shiftRoleId] ?? shift.shiftRole.colorToken, publicNote: shift.publicNote, internalNote: shift.internalNote,
            createdByAccountId: accountId, updatedByAccountId: accountId });
          copiedAssignments.push(...shift.assignments.map((assignment) => ({ shiftId, ...copyAssignmentSnapshot(assignment, currentById) })));
        }
        for (let offset = 0; offset < copiedShifts.length; offset += 500) await transaction.shift.createMany({ data: copiedShifts.slice(offset, offset + 500) });
        for (let offset = 0; offset < copiedAssignments.length; offset += 500) await transaction.shiftAssignment.createMany({ data: copiedAssignments.slice(offset, offset + 500) });
        const updatedPeriod = await transaction.rosterPeriod.update({ where: { id: period.id }, data: { version: { increment: 1 } } });
        return { created: plans.length, period: serializePeriod(updatedPeriod) };
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      if (isPeriodConstraintError(error)) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标日期已有不兼容的排班周期，请刷新后重试" });
      throw error;
    }
  }

  async previewRepeatShift(input: { storeId: string; sourceShiftId: string; targetDates: string[]; activeEmployeeIds: string[]; formalRoleIds?: string[]; qualified?: RoleQualifications }) {
    validateRepeatDates(input.targetDates);
    return this.db.$transaction(async (transaction) => {
      const source = await transaction.shift.findFirst({ where: { id: input.sourceShiftId, storeId: input.storeId }, select: { date: true } });
      if (!source) throw new HttpError(404, "未找到来源班次");
      const sourceDate = toDateString(source.date);
      const previews = [];
      for (const targetDate of input.targetDates) previews.push((await inspectDayCopy(transaction, { ...input, sourceDate, targetDate })).preview);
      return {
        policy: "ALL_OR_NOTHING" as const,
        shiftCount: previews.reduce((sum, preview) => sum + preview.shiftCount, 0),
        readyShifts: previews.reduce((sum, preview) => sum + preview.readyShifts, 0),
        availableAssignments: previews.reduce((sum, preview) => sum + preview.availableAssignments, 0),
        blockedAssignments: previews.reduce((sum, preview) => sum + preview.blockedAssignments, 0),
        issues: previews.flatMap((preview) => preview.issues),
        canCopy: previews.length > 0 && previews.every((preview) => preview.canCopy),
        targetDates: input.targetDates,
        sourcePeriodVersion: previews[0]?.sourcePeriodVersion ?? null,
        targetPeriodVersions: previews.map((preview) => ({ date: preview.targetDate, version: preview.targetPeriodVersion })),
      };
    });
  }

  async repeatShift(input: { storeId: string; sourceShiftId: string; targetDates: string[]; activeEmployeeIds: string[]; currentAssignments?: AssignmentSnapshot[]; formalRoleIds?: string[]; formalRoleNames?: Record<string, string>; formalRoleColors?: Record<string, string>; qualified?: RoleQualifications; expectedSourcePeriodVersion: number | null; expectedTargetPeriodVersions: Array<{ date: string; version: number | null }> }, accountId: string) {
    validateRepeatDates(input.targetDates);
    try {
      return await this.db.$transaction(async (transaction) => {
        await lockStorePeriods(transaction, input.storeId);
        const source = await transaction.shift.findFirst({ where: { id: input.sourceShiftId, storeId: input.storeId }, include: shiftInclude });
        if (!source) throw new SchedulingError(409, { code: "STALE_VERSION", message: "来源班次已被删除，请重新检查重复预览" });
        await lockEmployees(transaction, input.storeId, source.assignments.map((assignment) => assignment.employeeId));
        const sourceDate = toDateString(source.date);
        const inspected = [];
        for (const targetDate of input.targetDates) inspected.push(await inspectDayCopy(transaction, { ...input, sourceDate, targetDate }));
        if (inspected.some(({ preview }) => preview.sourcePeriodVersion !== input.expectedSourcePeriodVersion)
          || inspected.some(({ preview }) => preview.targetPeriodVersion !== input.expectedTargetPeriodVersions.find((item) => item.date === preview.targetDate)?.version)) {
          throw new SchedulingError(409, { code: "STALE_VERSION", message: "来源或目标排班已改变，请重新检查重复预览" });
        }
        const firstIssue = inspected.flatMap(({ preview }) => preview.issues)[0];
        if (firstIssue) throw new SchedulingError(inspected.some(({ invalidPeriodShape }) => invalidPeriodShape)
          || firstIssue.code === "SHIFT_OVERLAP" || firstIssue.code === "CROSS_STORE_CONFLICT" || firstIssue.code === "PERIOD_PUBLISHED" || firstIssue.code === "SHIFT_PERIOD_MISMATCH" ? 409 : 422, {
          code: firstIssue.code, employeeId: firstIssue.employeeId, employeeName: firstIssue.employeeName,
          shiftId: firstIssue.shiftId, message: firstIssue.reason,
        });
        const currentById = input.currentAssignments ? new Map(input.currentAssignments.map((assignment) => [assignment.employeeId, assignment])) : null;
        const periods = new Map<string, string>();
        const touched = new Set<string>();
        let created = 0;
        for (const { plans, targetPeriod, settings } of inspected) {
          for (const { shift, date, startAt, endAt } of plans) {
            const cycle = !targetPeriod ? configuredCycleRange(date, settings) : null;
            const weekKey = cycle?.startDate ?? toDateString(targetPeriod!.startDate);
            let periodId = targetPeriod?.id ?? periods.get(weekKey);
            if (!periodId) {
              const period = await transaction.rosterPeriod.create({ data: {
                storeId: input.storeId, startDate: dateOnly(cycle!.startDate), endDate: dateOnly(cycle!.endDate), cycleType: cycle!.cycleType, createdByAccountId: accountId,
              } });
              periodId = period.id;
              periods.set(weekKey, periodId);
            }
            await transaction.shift.create({ data: {
              rosterPeriodId: periodId, storeId: input.storeId, date: dateOnly(date), startAt, endAt,
              breakMinutes: shift.breakMinutes, shiftRoleId: shift.shiftRoleId, roleNameSnapshot: input.formalRoleNames?.[shift.shiftRoleId] ?? shift.roleNameSnapshot,
              roleColorSnapshot: input.formalRoleColors?.[shift.shiftRoleId] ?? shift.shiftRole.colorToken, publicNote: shift.publicNote, internalNote: shift.internalNote,
              createdByAccountId: accountId, updatedByAccountId: accountId,
              assignments: { create: shift.assignments.map((assignment) => copyAssignmentSnapshot(assignment, currentById)) },
            } });
            touched.add(periodId);
            created += 1;
          }
        }
        for (const periodId of touched) await transaction.rosterPeriod.update({ where: { id: periodId }, data: { version: { increment: 1 } } });
        return { created };
      });
    } catch (error) {
      if (isPeriodConstraintError(error)) throw new SchedulingError(409, { code: "TARGET_PERIOD_CONFLICT", message: "目标日期已有不兼容的排班周期，请重新检查预览" });
      throw error;
    }
  }

  async batchDelete(storeId: string, items: Array<{ id: string; version: number }>) {
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, storeId);
      const shifts = await transaction.shift.findMany({ where: { storeId, id: { in: items.map((item) => item.id) } }, include: { rosterPeriod: { select: { status: true } } } });
      if (shifts.length !== items.length) throw new HttpError(404, "部分班次不存在或不属于当前门店");
      for (const item of items) { const deleted = await transaction.shift.deleteMany({ where: { id: item.id, storeId, version: item.version } }); if (!deleted.count) throw new HttpError(409, "部分班次已被其他人更新，请刷新后重试"); }
      const periodIds = [...new Set(shifts.map((shift) => shift.rosterPeriodId))];
      await transaction.rosterPeriod.updateMany({ where: { id: { in: periodIds } }, data: { version: { increment: 1 } } });
      return { deleted: items.length };
    });
  }

  async batchUpdate(storeId: string, items: Array<{ id: string; version: number }>, patch: { shiftRoleId?: string; breakMinutes?: number; publicNote?: string | null; formalRoleName?: string; formalRoleColor?: string }, accountId: string, activeEmployeeIds: string[], formalRoleIds?: string[], qualified?: RoleQualifications) {
    if (patch.shiftRoleId) await this.requireRole(storeId, patch.shiftRoleId);
    const activeEmployees = new Set(activeEmployeeIds);
    return this.db.$transaction(async (transaction) => {
      await lockStorePeriods(transaction, storeId);
      const role = patch.shiftRoleId ? await requireCurrentShiftRole(transaction, storeId, patch.shiftRoleId) : null;
      const shifts = await transaction.shift.findMany({ where: { storeId, id: { in: items.map((item) => item.id) } }, include: { rosterPeriod: { select: { status: true, storeId: true, startDate: true, endDate: true, cycleType: true } }, assignments: { select: { employeeId: true, employeeNameSnapshot: true } } } });
      const ineligible = shifts.flatMap((shift) => shift.assignments).find((assignment) => !activeEmployees.has(assignment.employeeId));
      if (ineligible) throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: ineligible.employeeId, employeeName: ineligible.employeeNameSnapshot, storeId, message: `${ineligible.employeeNameSnapshot} is archived or no longer in this store; the shift cannot be changed.` });
      for (const shift of shifts) assertRoleAssignmentsQualified(patch.shiftRoleId ?? shift.shiftRoleId, shift.assignments, qualified, shift.id);
      if (shifts.length !== items.length) throw new HttpError(404, "部分班次不存在或不属于当前门店");
      for (const shift of shifts) assertPeriodShape(shift.rosterPeriod);
      const misplaced = shifts.find((shift) => !shiftBelongsToPeriod(shift, shift.rosterPeriod));
      if (misplaced) throw shiftPeriodMismatchError(misplaced.id);
      const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId } });
      for (const shift of shifts) {
        validateShiftAgainstSettings(settings, toDateString(shift.date), shift.startAt, shift.endAt,
          (shift.endAt.getTime() - shift.startAt.getTime()) / 60_000);
      }
      if (!role) {
        const activeRoles = await transaction.shiftRole.findMany({ where: {
          id: { in: [...new Set(shifts.map((shift) => shift.shiftRoleId))] }, isActive: true, OR: [{ storeId: null }, { storeId }],
        }, select: { id: true } });
        const activeRoleIds = new Set(activeRoles.map((item) => item.id));
        if (shifts.some((shift) => !activeRoleIds.has(shift.shiftRoleId))) {
          throw new SchedulingError(422, { code: "INACTIVE_SHIFT_ROLE", message: "批量更新包含已停用或不属于当前门店的岗位，请重新选择岗位" });
        }
        if (formalRoleIds) {
          const allowedIds = new Set(formalRoleIds);
          const unverified = shifts.find((shift) => !allowedIds.has(shift.shiftRoleId));
          if (unverified) throw new SchedulingError(422, { code: "UNVERIFIED_SHIFT_ROLE", shiftId: unverified.id, message: `岗位 ${unverified.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中，请先更换岗位` });
        }
      }
      const employeeIds = [...new Set(shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)))];
      const availabilityDates = [...new Set(shifts.flatMap((shift) => [-1, 0, 1].map((offset) => shiftDate(shift.date, offset).getTime())))].map((value) => new Date(value));
      const availability = await transaction.employeeAvailability.findMany({ where: {
        storeId, employeeId: { in: employeeIds }, date: { in: availabilityDates },
      }, select: { employeeId: true, status: true, startAt: true, endAt: true } });
      const availabilityByEmployee = new Map<string, AvailabilityWindow[]>();
      for (const row of availability) {
        const rows = availabilityByEmployee.get(row.employeeId) ?? [];
        rows.push(row);
        availabilityByEmployee.set(row.employeeId, rows);
      }
      for (const shift of shifts) for (const assignment of shift.assignments) {
        if (!isCoveredByAvailability(availabilityByEmployee.get(assignment.employeeId) ?? [], shift.startAt, shift.endAt)) {
          throw new SchedulingError(422, { code: "EMPLOYEE_UNAVAILABLE", employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot,
            storeId, start: shift.startAt.toISOString(), end: shift.endAt.toISOString(),
            message: `${assignment.employeeNameSnapshot} 在 ${shift.startAt.toISOString()}–${shift.endAt.toISOString()} 没有覆盖整个班次的可用时间` });
        }
      }
      if (patch.breakMinutes !== undefined && shifts.some((shift) => patch.breakMinutes! >= (shift.endAt.getTime() - shift.startAt.getTime()) / 60_000)) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于每个班次时长" });
      for (const item of items) {
        const updated = await transaction.shift.updateMany({ where: { id: item.id, storeId, version: item.version }, data: { ...(role ? { shiftRoleId: role.id, roleNameSnapshot: patch.formalRoleName ?? role.nameZh, roleColorSnapshot: patch.formalRoleColor ?? role.colorToken } : {}), ...(patch.breakMinutes !== undefined ? { breakMinutes: patch.breakMinutes } : {}), ...(patch.publicNote !== undefined ? { publicNote: cleanNote(patch.publicNote) } : {}), updatedByAccountId: accountId, version: { increment: 1 } } });
        if (!updated.count) throw new HttpError(409, "部分班次已被其他人更新，请刷新后重试");
      }
      await transaction.rosterPeriod.updateMany({ where: { id: { in: [...new Set(shifts.map((shift) => shift.rosterPeriodId))] } }, data: { version: { increment: 1 } } });
      return { updated: items.length };
    });
  }

  async exportPeriod(storeId: string, periodId: string) {
    const { period, shifts } = await this.db.$transaction(async (transaction) => {
      const period = await transaction.rosterPeriod.findFirst({ where: { id: periodId, storeId } });
      if (!period) throw new HttpError(404, "未找到排班周期");
      const shifts = await transaction.shift.findMany({
        where: { storeId, rosterPeriodId: periodId },
        include: shiftInclude,
        orderBy: [{ date: "asc" }, { startAt: "asc" }],
      });
      return { period, shifts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { period: serializePeriod(period), shifts: shifts.map(serializeShift) };
  }

  private async validateShiftMutation(input: ShiftMutation) {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "班次结束时间必须晚于开始时间" });
    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    if (input.breakMinutes < 0 || input.breakMinutes >= durationMinutes) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于班次时长" });
    const [period, role, settings] = await Promise.all([
      this.db.rosterPeriod.findFirst({ where: { id: input.rosterPeriodId, storeId: input.storeId } }),
      this.db.shiftRole.findFirst({ where: { id: input.shiftRoleId, isActive: true, OR: [{ storeId: null }, { storeId: input.storeId }] } }),
      this.db.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } }),
    ]);
    if (!period) throw new HttpError(404, "未找到排班周期");
    assertPeriodShape(period);
    if (input.date < toDateString(period.startDate) || input.date > toDateString(period.endDate)) throw new HttpError(400, "班次日期不在排班周期内");
    if (!role) throw new HttpError(400, "所选岗位不存在或已停用");
    if (!input.assignments.length) throw new HttpError(400, "请至少选择一名员工");
    validateShiftAgainstSettings(settings, input.date, startAt, endAt, durationMinutes);
    return { startAt, endAt, period, role };
  }

  private async requireRole(storeId: string, roleId: string) {
    const role = await this.db.shiftRole.findFirst({ where: { id: roleId, isActive: true, OR: [{ storeId: null }, { storeId }] } });
    if (!role) throw new HttpError(400, "所选岗位不存在或已停用");
    return role;
  }
}

function serializePeriod(period: { id: string; storeId: string; startDate: Date; endDate: Date; cycleType: RosterCycleType; status: string; version: number; createdAt: Date; updatedAt: Date; publishedAt: Date | null }) {
  return { ...period, startDate: toDateString(period.startDate), endDate: toDateString(period.endDate), createdAt: period.createdAt.toISOString(), updatedAt: period.updatedAt.toISOString(), publishedAt: period.publishedAt?.toISOString() ?? null };
}

async function agentCalendarState(tx:Prisma.TransactionClient,storeId:string,from:string,to:string) {
  const periods=await tx.rosterPeriod.findMany({where:{storeId,startDate:{lte:dateOnly(to)},endDate:{gte:dateOnly(from)}},orderBy:{id:'asc'}});
  const shifts=await tx.shift.findMany({where:{storeId,date:{gte:dateOnly(from),lte:dateOnly(to)}},include:{assignments:{orderBy:{employeeId:'asc'}}},orderBy:{id:'asc'}});
  const token=createHash('sha256').update(JSON.stringify({storeId,from,to,periods,shifts})).digest('hex');
  return {token,periods,shifts};
}

function agentShiftId(runId:string,key:string) {
  const bytes=createHash('sha256').update(runId+'|'+key).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const value=bytes.toString('hex');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

function serializeShift(shift: Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>) {
  return { ...shift, date: toDateString(shift.date), startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(), createdAt: shift.createdAt.toISOString(), updatedAt: shift.updatedAt.toISOString() };
}

function publicationShift(shift: Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>, currentById: Map<string, AssignmentSnapshot>, formalRoleName?: string, formalRoleColor?: string): PublicationShift {
  return {
    id: shift.id,
    rosterPeriodId: shift.rosterPeriodId,
    storeId: shift.storeId,
    date: toDateString(shift.date),
    startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(),
    breakMinutes: shift.breakMinutes,
    shiftRoleId: shift.shiftRoleId,
    roleNameSnapshot: formalRoleName ?? shift.shiftRole.nameZh,
    roleColorSnapshot: formalRoleColor ?? shift.shiftRole.colorToken,
    publicNote: shift.publicNote,
    internalNote: shift.internalNote,
    assignments: shift.assignments.map((assignment) => ({
      id: assignment.id,
      ...currentById.get(assignment.employeeId)!,
    })),
  };
}

type PublicationRow = Prisma.RosterPublicationGetPayload<{ include: { rosterPeriod: true } }>;
function normalizePublicationSnapshot(value: Prisma.JsonValue, row: PublicationRow): PublicationSnapshot {
  const raw = record(value);
  const currentPeriod = row.rosterPeriod;
  const rawPeriod = record(raw.period);
  const rawStore = record(raw.store);
  const rawPublisher = record(raw.publishedBy);
  if (!Array.isArray(raw.shifts)) throw new HttpError(503, "发布快照缺少班次清单，请核查归档数据");
  const matchesScope = (value: unknown, expected: string) => value === undefined || value === null || value === expected;
  if (![raw.storeId, rawStore.id, rawPeriod.storeId].every((value) => matchesScope(value, currentPeriod.storeId))
    || !matchesScope(rawPeriod.id, row.rosterPeriodId)
    || raw.shifts.some((value) => {
      const shift = record(value);
      return !matchesScope(shift.storeId, currentPeriod.storeId)
        || !matchesScope(shift.rosterPeriodId, row.rosterPeriodId);
    })) {
    throw new HttpError(503, "发布快照的门店或排班周期归属不一致，请核查归档数据");
  }
  if (![raw.startDate, rawPeriod.startDate].every((value) => matchesScope(value, toDateString(currentPeriod.startDate)))
    || ![raw.endDate, rawPeriod.endDate].every((value) => matchesScope(value, toDateString(currentPeriod.endDate)))
    || ![raw.cycleType, rawPeriod.cycleType].every((value) => matchesScope(value, currentPeriod.cycleType))) {
    throw new HttpError(503, "发布快照的排班周期日期或类型与归档记录不一致，请核查归档数据");
  }
  const timezone = stringValue(raw.timezone);
  if (Object.hasOwn(raw, "timezone")) {
    if (!timezone?.trim()) throw new HttpError(503, "发布快照的时区无效，请核查归档数据");
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0)); }
    catch { throw new HttpError(503, "发布快照的时区无效，请核查归档数据"); }
  }
  const shifts = raw.shifts.map(normalizePublicationShift);
  return {
    schemaVersion: 1,
    store: { id: stringValue(rawStore.id) ?? stringValue(raw.storeId) ?? currentPeriod.storeId, name: stringValue(rawStore.name) ?? stringValue(raw.storeId) ?? currentPeriod.storeId },
    timezone: timezone ?? undefined,
    period: {
      id: stringValue(rawPeriod.id) ?? currentPeriod.id,
      storeId: stringValue(rawPeriod.storeId) ?? stringValue(raw.storeId) ?? currentPeriod.storeId,
      startDate: stringValue(rawPeriod.startDate) ?? stringValue(raw.startDate) ?? toDateString(currentPeriod.startDate),
      endDate: stringValue(rawPeriod.endDate) ?? stringValue(raw.endDate) ?? toDateString(currentPeriod.endDate),
      cycleType: rawPeriod.cycleType === "FORTNIGHT" ? "FORTNIGHT" : currentPeriod.cycleType,
      status: "PUBLISHED",
      version: numberValue(rawPeriod.version) ?? row.periodVersion,
    },
    publishedBy: { accountId: stringValue(rawPublisher.accountId) ?? row.publishedByAccountId, displayName: stringValue(rawPublisher.displayName) ?? row.publishedByAccountId },
    shifts,
  };
}

function normalizePublicationShift(value: Prisma.JsonValue): PublicationShift {
  const raw = record(value);
  if (!Array.isArray(raw.assignments) || raw.assignments.length === 0) throw new HttpError(503, "发布快照缺少员工班次，请核查归档数据");
  const assignments = raw.assignments.map((value) => {
    const assignment = record(value);
    const employeeId = stringValue(assignment.employeeId);
    const employeeNameSnapshot = stringValue(assignment.employeeNameSnapshot);
    if (!employeeId?.trim() || !employeeNameSnapshot?.trim()) {
      throw new HttpError(503, "发布快照缺少员工身份信息，请核查归档数据");
    }
    return {
      id: stringValue(assignment.id) ?? "snapshot-assignment",
      employeeId,
      employeeNameSnapshot,
      employeeTypeSnapshot: stringValue(assignment.employeeTypeSnapshot) ?? "UNKNOWN",
      employmentTypeSnapshot: stringValue(assignment.employmentTypeSnapshot),
      officialScoreSnapshot: numberValue(assignment.officialScoreSnapshot),
      tierSnapshot: stringValue(assignment.tierSnapshot),
      officialScoreRoundId: stringValue(assignment.officialScoreRoundId),
      officialScoreClosedAt: stringValue(assignment.officialScoreClosedAt),
    };
  });
  const id = stringValue(raw.id);
  const date = stringValue(raw.date);
  const startAt = stringValue(raw.startAt);
  const endAt = stringValue(raw.endAt);
  if (!id || !date || !startAt || !endAt || !isCalendarDate(date)
    || !Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt))
    || Date.parse(startAt) >= Date.parse(endAt)) {
    throw new HttpError(503, "发布快照包含不完整的班次，请核查归档数据");
  }
  const shiftRole = record(raw.shiftRole);
  const breakMinutes = numberValue(raw.breakMinutes);
  const durationMinutes = (Date.parse(endAt) - Date.parse(startAt)) / 60_000;
  if (breakMinutes === null || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes >= durationMinutes) {
    throw new HttpError(503, "发布快照缺少有效休息时间，请核查归档数据");
  }
  const roleNameSnapshot = stringValue(raw.roleNameSnapshot) ?? stringValue(shiftRole.nameZh);
  if (!roleNameSnapshot?.trim()) throw new HttpError(503, "发布快照缺少岗位名称，请核查归档数据");
  return {
    id,
    rosterPeriodId: stringValue(raw.rosterPeriodId) ?? "",
    storeId: stringValue(raw.storeId) ?? "",
    date,
    startAt,
    endAt,
    breakMinutes,
    shiftRoleId: stringValue(raw.shiftRoleId) ?? stringValue(shiftRole.id) ?? "",
    roleNameSnapshot,
    roleColorSnapshot: stringValue(raw.roleColorSnapshot) ?? stringValue(shiftRole.colorToken) ?? "#64748b",
    publicNote: stringValue(raw.publicNote),
    internalNote: stringValue(raw.internalNote),
    assignments,
  };
}

function publicationSummary(row: PublicationRow, snapshot: PublicationSnapshot, revisionNumber: number) {
  const totalHours = snapshot.shifts.reduce((total, shift) => total + Math.max(0, (new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 3_600_000 - shift.breakMinutes / 60) * shift.assignments.length, 0);
  return { id: row.id, rosterPeriodId: row.rosterPeriodId, revisionNumber, periodVersion: row.periodVersion, publishedAt: row.publishedAt.toISOString(), publishedBy: snapshot.publishedBy, store: snapshot.store, period: snapshot.period, shiftCount: snapshot.shifts.length, assignmentCount: snapshot.shifts.reduce((sum, shift) => sum + shift.assignments.length, 0), totalHours };
}

function employeeSafePublication(snapshot: PublicationSnapshot) {
  return {
    ...snapshot,
    shifts: snapshot.shifts.map((shift) => ({
      id: shift.id,
      rosterPeriodId: shift.rosterPeriodId,
      storeId: shift.storeId,
      date: shift.date,
      startAt: shift.startAt,
      endAt: shift.endAt,
      breakMinutes: shift.breakMinutes,
      shiftRoleId: shift.shiftRoleId,
      roleNameSnapshot: shift.roleNameSnapshot,
      roleColorSnapshot: shift.roleColorSnapshot,
      publicNote: shift.publicNote,
      assignments: shift.assignments.map((assignment) => ({ id: assignment.id, employeeId: assignment.employeeId, employeeNameSnapshot: assignment.employeeNameSnapshot, employeeTypeSnapshot: assignment.employeeTypeSnapshot, employmentTypeSnapshot: assignment.employmentTypeSnapshot })),
    })),
  };
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === "string" ? value : null; }
function numberValue(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return null; }

function serializeAvailability(row: { id: string; employeeId: string; storeId: string; date: Date; startAt: Date | null; endAt: Date | null; status: AvailabilityStatus; note: string | null; source: AvailabilitySource; version: number; createdAt: Date; updatedAt: Date }) {
  return { ...row, date: toDateString(row.date), startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function cleanNote(value: string | null | undefined) { const next = value?.trim(); return next ? next : null; }
function createShiftPayloadHash(input: CreateReplayInput) {
  return createHash("sha256").update(JSON.stringify([
    input.storeId, input.targetStartDate, input.targetEndDate, input.date, input.startAt, input.endAt,
    input.breakMinutes, input.shiftRoleId, cleanNote(input.publicNote), cleanNote(input.internalNote),
    [...input.employeeIds].sort(),
  ])).digest("hex");
}
function validateRepeatDates(dates: string[]) {
  if (!dates.length || dates.length > 42 || new Set(dates).size !== dates.length || dates.some((date) => !isCalendarDate(date))) {
    throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: "请选择 1–42 个不重复的有效目标日期" });
  }
}

type DayCopyInput = { storeId: string; sourceDate: string; targetDate: string; activeEmployeeIds: string[]; formalRoleIds?: string[]; qualified?: RoleQualifications; sourceShiftId?: string };
type CopyIssue = { shiftDate: string; shiftId?: string; employeeId?: string; employeeName: string; code: SchedulingCode; severity: "BLOCKING_ERROR"; reason: string };

async function inspectDayCopy(transaction: Prisma.TransactionClient, input: DayCopyInput) {
  const source = await transaction.shift.findMany({ where: { storeId: input.storeId, date: dateOnly(input.sourceDate), ...(input.sourceShiftId ? { id: input.sourceShiftId } : {}) },
    include: { ...shiftInclude, rosterPeriod: { select: { storeId: true, startDate: true, endDate: true } } } });
  const settings = await transaction.rosterStoreSettings.findUnique({ where: { storeId: input.storeId } });
  if (!settings && source.length) throw new HttpError(409, "请先在设置中保存门店时区，再复制排班");
  const sourcePeriod = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: dateOnly(input.sourceDate) }, endDate: { gte: dateOnly(input.sourceDate) } } });
  const targetPeriod = await transaction.rosterPeriod.findFirst({ where: { storeId: input.storeId, startDate: { lte: dateOnly(input.targetDate) }, endDate: { gte: dateOnly(input.targetDate) } } });
  const issues: CopyIssue[] = [];
  const invalidPeriodShape = Boolean((sourcePeriod && !isValidPeriodShape(sourcePeriod)) || (targetPeriod && !isValidPeriodShape(targetPeriod)));
  let invalidTargetCycle = false;
  if (!targetPeriod) {
    try { configuredCycleRange(input.targetDate, settings); }
    catch (cause) {
      invalidTargetCycle = true;
      issues.push({ shiftDate: input.targetDate, employeeName: "—", code: "INVALID_TIME_RANGE", severity: "BLOCKING_ERROR",
        reason: cause instanceof Error ? cause.message : "目标周期无效" });
    }
  }
  if (sourcePeriod && !isValidPeriodShape(sourcePeriod)) issues.push({ shiftDate: input.sourceDate, employeeName: "—", code: "INVALID_TIME_RANGE",
    severity: "BLOCKING_ERROR", reason: "来源排班周期长度与周或双周类型不符，请先修复数据" });
  if (targetPeriod && !isValidPeriodShape(targetPeriod)) issues.push({ shiftDate: input.targetDate, employeeName: "—", code: "INVALID_TIME_RANGE",
    severity: "BLOCKING_ERROR", reason: "目标排班周期长度与周或双周类型不符，请先修复数据" });
  if (!source.length) issues.push({ shiftDate: input.sourceDate, employeeName: "—", code: "NO_SOURCE_SHIFTS", severity: "BLOCKING_ERROR", reason: "来源日期没有可复制的班次" });
  if (input.sourceDate === input.targetDate) issues.push({ shiftDate: input.targetDate, employeeName: "—", code: "TARGET_PERIOD_CONFLICT", severity: "BLOCKING_ERROR", reason: "来源和目标日期不能相同" });
  const dayOffset = Math.round((dateOnly(input.targetDate).getTime() - dateOnly(input.sourceDate).getTime()) / 86_400_000);
  const employeeIds = [...new Set(source.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)))];
  const targetDate = dateOnly(input.targetDate);
  const availability = await transaction.employeeAvailability.findMany({ where: { storeId: input.storeId, employeeId: { in: employeeIds }, date: { gte: shiftDate(targetDate, -1), lte: shiftDate(targetDate, 1) } }, select: { employeeId: true, status: true, startAt: true, endAt: true } });
  const availabilityByEmployee = new Map<string, AvailabilityWindow[]>();
  for (const row of availability) {
    const windows = availabilityByEmployee.get(row.employeeId) ?? [];
    windows.push(row);
    availabilityByEmployee.set(row.employeeId, windows);
  }
  const existingAssignments = await transaction.shiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, shift: { startAt: { lt: shiftDate(targetDate, 3) }, endAt: { gt: shiftDate(targetDate, -1) } } }, select: { employeeId: true, shift: { select: { storeId: true, startAt: true, endAt: true } } } });
  const existingByEmployee = new Map<string, typeof existingAssignments>();
  for (const assignment of existingAssignments) {
    const rows = existingByEmployee.get(assignment.employeeId) ?? [];
    rows.push(assignment);
    existingByEmployee.set(assignment.employeeId, rows);
  }
  const activeEmployeeIds = new Set(input.activeEmployeeIds);
  const copiedRanges = new Map<string, ReturnType<typeof copyShiftWallClock>>();
  const copiedWindows = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  const plans: Array<{ shift: (typeof source)[number]; date: string; startAt: Date; endAt: Date }> = [];
  let availableAssignments = 0;
  let unavailableAssignments = 0;
  let conflictingAssignments = 0;
  let structurallyBlockedAssignments = 0;
  let readyShifts = 0;
  for (const shift of source) {
    const before = issues.length;
    if (invalidPeriodShape || invalidTargetCycle) {
      structurallyBlockedAssignments += shift.assignments.length;
      continue;
    }
    if (!sourcePeriod || shift.rosterPeriodId !== sourcePeriod.id || !shiftBelongsToPeriod(shift, shift.rosterPeriod)) {
      issues.push({ shiftDate: input.sourceDate, shiftId: shift.id, employeeName: "—", code: "SHIFT_PERIOD_MISMATCH",
        severity: "BLOCKING_ERROR", reason: "来源班次的日期与所属排班周期不一致，请先修复数据" });
      structurallyBlockedAssignments += shift.assignments.length;
      continue;
    }
    if (!shift.shiftRole.isActive || (shift.shiftRole.storeId !== null && shift.shiftRole.storeId !== input.storeId)) {
      issues.push({ shiftDate: input.targetDate, shiftId: shift.id, employeeName: "—", code: "INACTIVE_SHIFT_ROLE", severity: "BLOCKING_ERROR", reason: `岗位 ${shift.roleNameSnapshot} 已停用或不属于当前门店，请先更换岗位` });
      structurallyBlockedAssignments += shift.assignments.length;
      continue;
    }
    if (input.formalRoleIds && !input.formalRoleIds.includes(shift.shiftRoleId)) {
      issues.push({ shiftDate: input.targetDate, shiftId: shift.id, employeeName: "—", code: "UNVERIFIED_SHIFT_ROLE", severity: "BLOCKING_ERROR", reason: `岗位 ${shift.roleNameSnapshot} 不在 Evaluate 当前门店的正式岗位清单中` });
      structurallyBlockedAssignments += shift.assignments.length;
      continue;
    }
    let copied: ReturnType<typeof copyShiftWallClock>;
    try {
      copied = validatedCopyShiftWallClock(shift, dayOffset, settings!.timezone, copiedRanges);
      validateShiftAgainstSettings(settings, copied.date, copied.startAt, copied.endAt, (copied.endAt.getTime() - copied.startAt.getTime()) / 60_000);
    } catch (cause) {
      issues.push({ shiftDate: input.targetDate, shiftId: shift.id, employeeName: "—", code: cause instanceof SchedulingError ? cause.validation.code : "INVALID_TIME_RANGE", severity: "BLOCKING_ERROR", reason: cause instanceof Error ? cause.message : "目标日期的时间无效" });
      structurallyBlockedAssignments += shift.assignments.length;
      continue;
    }
    if (!shift.assignments.length) {
      issues.push({ shiftDate: copied.date, shiftId: shift.id, employeeName: "—", code: "INVALID_ASSIGNMENTS", severity: "BLOCKING_ERROR", reason: "来源班次没有员工分配" });
      continue;
    }
    plans.push({ shift, ...copied });
    for (const assignment of shift.assignments) {
      const issueBase = { shiftDate: copied.date, shiftId: shift.id, employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, severity: "BLOCKING_ERROR" as const };
      if (!activeEmployeeIds.has(assignment.employeeId)) {
        issues.push({ ...issueBase, code: "ARCHIVED_EMPLOYEE", reason: "员工已归档或不属于当前门店" });
        unavailableAssignments += 1; continue;
      }
      if (unqualifiedAssignment(shift.shiftRoleId, [assignment], input.qualified)) {
        issues.push({ ...issueBase, code: "UNQUALIFIED_EMPLOYEE_ROLE", reason: "员工尚未获得该正式岗位授权" });
        unavailableAssignments += 1; continue;
      }
      if (!isCoveredByAvailability(availabilityByEmployee.get(assignment.employeeId) ?? [], copied.startAt, copied.endAt)) {
        issues.push({ ...issueBase, code: "EMPLOYEE_UNAVAILABLE", reason: "目标时间不在可用时段内" });
        unavailableAssignments += 1; continue;
      }
      const conflict = existingByEmployee.get(assignment.employeeId)?.find((item) => intervalsOverlap(item.shift.startAt, item.shift.endAt, copied.startAt, copied.endAt));
      if (conflict) {
        issues.push({ ...issueBase, code: conflict.shift.storeId === input.storeId ? "SHIFT_OVERLAP" : "CROSS_STORE_CONFLICT", reason: `员工已有${conflict.shift.storeId === input.storeId ? "本门店" : `其他门店 ${conflict.shift.storeId}`}班次 ${conflict.shift.startAt.toISOString()}–${conflict.shift.endAt.toISOString()}` });
        conflictingAssignments += 1; continue;
      }
      const employeeWindows = copiedWindows.get(assignment.employeeId) ?? [];
      if (employeeWindows.some((window) => intervalsOverlap(window.startAt, window.endAt, copied.startAt, copied.endAt))) {
        issues.push({ ...issueBase, code: "SHIFT_OVERLAP", reason: "复制后的班次与同一批次中该员工的另一班次重叠" });
        conflictingAssignments += 1; continue;
      }
      employeeWindows.push({ startAt: copied.startAt, endAt: copied.endAt });
      copiedWindows.set(assignment.employeeId, employeeWindows);
      availableAssignments += 1;
    }
    if (issues.length === before) readyShifts += 1;
  }
  return {
    preview: { policy: "ALL_OR_NOTHING" as const, shiftCount: source.length, readyShifts, availableAssignments,
      blockedAssignments: unavailableAssignments + conflictingAssignments + structurallyBlockedAssignments, unavailableAssignments, conflictingAssignments,
      issues, canCopy: issues.length === 0, sourceDate: input.sourceDate, targetDate: input.targetDate,
      sourcePeriodVersion: sourcePeriod?.version ?? null,
      targetPeriodVersion: targetPeriod?.version ?? null },
    plans, targetPeriod, settings, invalidPeriodShape,
  };
}

function assignmentRows(assignments: AssignmentSnapshot[]) {
  return assignments.map((assignment) => ({ ...assignment, officialScoreClosedAt: assignment.officialScoreClosedAt ? new Date(assignment.officialScoreClosedAt) : null }));
}
type CopySourceAssignment = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>["assignments"][number];
function copyAssignmentSnapshot(source: CopySourceAssignment, currentById: Map<string, AssignmentSnapshot> | null) {
  const current = currentById?.get(source.employeeId);
  if (currentById && !current) {
    throw new SchedulingError(422, { code: "ARCHIVED_EMPLOYEE", employeeId: source.employeeId,
      employeeName: source.employeeNameSnapshot, message: "Employee is no longer in the current store workforce; refresh the copy preview." });
  }
  if (current) return assignmentRows([current])[0]!;
  return {
    employeeId: source.employeeId,
    employeeNameSnapshot: source.employeeNameSnapshot,
    employeeTypeSnapshot: source.employeeTypeSnapshot,
    employmentTypeSnapshot: source.employmentTypeSnapshot,
    officialScoreSnapshot: source.officialScoreSnapshot,
    tierSnapshot: source.tierSnapshot,
    officialScoreRoundId: source.officialScoreRoundId,
    officialScoreClosedAt: source.officialScoreClosedAt,
  };
}
function isUniqueError(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
function isRecordNotFound(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2025"; }
function isPeriodConstraintError(error: unknown) { return isUniqueError(error) || (typeof error === "object" && error !== null && "code" in error && (error.code === "P2004" || error.code === "23P01")); }
function validateClockRange(start: string, end: string, breakMinutes: number) {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const duration = (minutes(end) - minutes(start) + 1440) % 1440;
  if (duration === 0) throw new HttpError(400, "结束时间不能与开始时间相同");
  if (breakMinutes < 0 || breakMinutes >= duration) throw new SchedulingError(400, { code: "INVALID_BREAK", message: "休息时间必须短于班次时长" });
}
function validateTimeZone(timezone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0)); }
  catch { throw new HttpError(400, "门店时区无效"); }
}
function validateShiftAgainstSettings(settings: { timezone: string; openingTime: string; closingTime: string; minimumShiftMinutes: number } | null, date: string, startAt: Date, endAt: Date, durationMinutes: number) {
  if (!settings) throw new HttpError(409, "请先在设置中保存门店时区，再创建或修改班次");
  const timezone = settings.timezone;
  const start = localDateTime(startAt, timezone);
  const end = localDateTime(endAt, timezone);
  if (start.date !== date || durationMinutes > 1440) throw new SchedulingError(400, { code: "INVALID_CROSS_DAY", start: startAt.toISOString(), end: endAt.toISOString(), message: "班次开始日期必须与排班日期相同，且最长为 24 小时" });
  const nextDate = toDateString(shiftDate(dateOnly(date), 1));
  if (end.date !== date && end.date !== nextDate) throw new SchedulingError(400, { code: "INVALID_CROSS_DAY", start: startAt.toISOString(), end: endAt.toISOString(), message: "班次结束日期最多可到次日" });
  if (durationMinutes < settings.minimumShiftMinutes) throw new SchedulingError(400, { code: "MIN_SHIFT_DURATION", start: startAt.toISOString(), end: endAt.toISOString(), message: `班次不能短于 ${settings.minimumShiftMinutes} 分钟`, metadata: { minimumMinutes: settings.minimumShiftMinutes } });
  const overnightStore = settings.closingTime < settings.openingTime;
  const morningSegment = overnightStore && start.time < settings.closingTime;
  const withinOperatingHours = morningSegment
    ? end.date === date && end.time <= settings.closingTime
    : start.time >= settings.openingTime && (overnightStore
      ? (end.date === date || end.time <= settings.closingTime)
      : (end.date === date && end.time <= settings.closingTime));
  if (!withinOperatingHours) {
    throw new SchedulingError(400, { code: "OUTSIDE_OPERATING_HOURS", start: startAt.toISOString(), end: endAt.toISOString(), message: `班次时间必须在门店营业时段 ${settings.openingTime}-${settings.closingTime}${overnightStore ? "（次日）" : ""} 内`, metadata: { openingTime: settings.openingTime, closingTime: settings.closingTime } });
  }
}
function localDateTime(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
function shiftBelongsToPeriod(shift: { storeId: string; date: Date }, period: { storeId: string; startDate: Date; endDate: Date }) {
  return shift.storeId === period.storeId && shift.date >= period.startDate && shift.date <= period.endDate;
}
function isConfiguredWeekStart(settings: { weekStartsOn: number } | null, startDate: string) {
  return dateOnly(startDate).getUTCDay() === (settings?.weekStartsOn ?? 1);
}
type CycleSettings = { cycleType: RosterCycleType; weekStartsOn: number; fortnightAnchorDate: string | null } | null;
function configuredCycleRange(date: string, settings: CycleSettings, cycleType = settings?.cycleType ?? "WEEK") {
  const target = dateOnly(date);
  if (cycleType === "FORTNIGHT") {
    const anchor = settings?.fortnightAnchorDate;
    if (!anchor || !isCalendarDate(anchor) || !isConfiguredWeekStart(settings, anchor)) {
      throw new SchedulingError(409, { code: "INVALID_TIME_RANGE", message: "请先在门店设置中确认双周起始日期" });
    }
    const anchorDate = dateOnly(anchor);
    const dayOffset = Math.floor((target.getTime() - anchorDate.getTime()) / 86_400_000 / 14) * 14;
    const start = shiftDate(anchorDate, dayOffset);
    return { startDate: toDateString(start), endDate: toDateString(shiftDate(start, 13)), cycleType };
  }
  const start = shiftDate(target, -((target.getUTCDay() - (settings?.weekStartsOn ?? 1) + 7) % 7));
  return { startDate: toDateString(start), endDate: toDateString(shiftDate(start, 6)), cycleType };
}
function assertConfiguredCycleRange(date: string, startDate: string, endDate: string, settings: CycleSettings, cycleType = settings?.cycleType ?? "WEEK") {
  const expected = configuredCycleRange(date, settings, cycleType);
  if (startDate !== expected.startDate || endDate !== expected.endDate) {
    throw new SchedulingError(400, { code: "INVALID_TIME_RANGE", message: `目标${cycleType === "FORTNIGHT" ? "双周" : "周"}周期必须从 ${expected.startDate} 到 ${expected.endDate}` });
  }
  return expected;
}
function isValidPeriodShape(period: { startDate: Date; endDate: Date; cycleType: RosterCycleType }) {
  const days = Math.round((period.endDate.getTime() - period.startDate.getTime()) / 86_400_000) + 1;
  return days === (period.cycleType === "WEEK" ? 7 : 14);
}
function assertPeriodShape(period: { startDate: Date; endDate: Date; cycleType: RosterCycleType }) {
  if (!isValidPeriodShape(period)) throw new SchedulingError(409, { code: "INVALID_TIME_RANGE",
    message: "排班周期长度与周或双周类型不符，请先修复数据" });
}
function shiftPeriodMismatchError(shiftId: string) {
  return new SchedulingError(409, { code: "SHIFT_PERIOD_MISMATCH", shiftId,
    message: "班次的门店或日期与所属排班周期不一致，请先修复数据" });
}
function shiftDate(value: Date, days: number) { const next = new Date(value); next.setUTCDate(next.getUTCDate() + days); return next; }
function copyShiftWallClockCached(cache: Map<string, ReturnType<typeof copyShiftWallClock>>, shift: { date: Date; startAt: Date; endAt: Date }, dayOffset: number, timezone: string) {
  const key = `${shift.date.getTime()}:${shift.startAt.getTime()}:${shift.endAt.getTime()}:${dayOffset}:${timezone}`;
  let copied = cache.get(key);
  if (!copied) {
    copied = copyShiftWallClock(shift, dayOffset, timezone);
    cache.set(key, copied);
  }
  return copied;
}
function validatedCopyShiftWallClock(shift: { date: Date; startAt: Date; endAt: Date }, dayOffset: number, timezone: string, cache?: Map<string, ReturnType<typeof copyShiftWallClock>>) {
  try { return cache ? copyShiftWallClockCached(cache, shift, dayOffset, timezone) : copyShiftWallClock(shift, dayOffset, timezone); }
  catch (cause) { throw new SchedulingError(422, { code: "INVALID_TIME_RANGE", message: cause instanceof Error ? cause.message : "目标日期的时间无效" }); }
}
function conflictError(conflict: { employeeId?: string; employeeNameSnapshot: string; shift: { id?: string; storeId: string; startAt: Date; endAt: Date } }, targetStoreId: string) {
  const store = conflict.shift.storeId === targetStoreId ? "当前门店" : `门店 ${conflict.shift.storeId}`;
  return new SchedulingError(409, { code: conflict.shift.storeId === targetStoreId ? "SHIFT_OVERLAP" : "CROSS_STORE_CONFLICT", employeeId: conflict.employeeId, employeeName: conflict.employeeNameSnapshot, shiftId: conflict.shift.id, storeId: conflict.shift.storeId, start: conflict.shift.startAt.toISOString(), end: conflict.shift.endAt.toISOString(), message: `${conflict.employeeNameSnapshot} 在 ${store} 已有 ${conflict.shift.startAt.toISOString()}–${conflict.shift.endAt.toISOString()} 班次` });
}
async function lockEmployees(transaction: Prisma.TransactionClient, storeId: string, employeeIds: string[]) {
  void storeId;
  for (const employeeId of [...new Set(employeeIds)].sort()) await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('roster-employee'), hashtext(${employeeId}))`);
}
type AvailabilityWindow = { status: AvailabilityStatus; startAt: Date | null; endAt: Date | null };

function normalizePresetShortcuts(value: unknown): PresetShortcut[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new HttpError(400, "请设置 1–30 个门店快捷码");
  }
  const seen = new Set<string>();
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new HttpError(400, "快捷码格式无效");
    const fields = item as Record<string, unknown>;
    const code = typeof fields.code === "string" ? fields.code.trim().toUpperCase() : "";
    const startTime = fields.startTime;
    const endTime = fields.endTime;
    if (!/^[A-Z]{1,20}$/.test(code) || seen.has(code)
      || typeof startTime !== "string" || typeof endTime !== "string"
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
      || startTime === endTime) {
      throw new HttpError(400, `快捷码 ${code || "(空)"} 的名称或时间无效`);
    }
    seen.add(code);
    return { code, startTime, endTime };
  });
}

export function isCoveredByAvailability(rows: AvailabilityWindow[], startAt: Date, endAt: Date): boolean {
  if (!(startAt < endAt)) return false;
  if (rows.some((row) => row.status === "UNAVAILABLE" && row.startAt && row.endAt && intervalsOverlap(row.startAt, row.endAt, startAt, endAt))) return false;
  const available = rows.filter((row) => row.status === "AVAILABLE" && row.startAt && row.endAt)
    .sort((left, right) => left.startAt!.getTime() - right.startAt!.getTime());
  let coveredUntil = startAt.getTime();
  for (const row of available) {
    if (row.startAt!.getTime() > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, row.endAt!.getTime());
    if (coveredUntil >= endAt.getTime()) return true;
  }
  return false;
}

async function assertAssignmentsAvailable(transaction: Prisma.TransactionClient, storeId: string, date: string, startAt: Date, endAt: Date, assignments: Pick<AssignmentSnapshot, "employeeId" | "employeeNameSnapshot">[]) {
  const rows = await transaction.employeeAvailability.findMany({
    where: { storeId, date: { gte: shiftDate(dateOnly(date), -1), lte: shiftDate(dateOnly(date), 1) }, employeeId: { in: assignments.map((item) => item.employeeId) } },
  });
  for (const assignment of assignments) {
    if (!isCoveredByAvailability(rows.filter((row) => row.employeeId === assignment.employeeId), startAt, endAt)) {
      throw new SchedulingError(422, { code: "EMPLOYEE_UNAVAILABLE", employeeId: assignment.employeeId, employeeName: assignment.employeeNameSnapshot, storeId, start: startAt.toISOString(), end: endAt.toISOString(), message: `${assignment.employeeNameSnapshot} 在 ${startAt.toISOString()}–${endAt.toISOString()} 没有覆盖整个班次的可用时间` });
    }
  }
}
async function lockStorePeriods(transaction: Prisma.TransactionClient, storeId: string) {
  await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${storeId}), hashtext('roster-period'))`);
}
async function requireCurrentShiftRole(transaction: Prisma.TransactionClient, storeId: string, roleId: string) {
  const role = await transaction.shiftRole.findFirst({ where: { id: roleId, isActive: true, OR: [{ storeId: null }, { storeId }] } });
  if (!role) throw new SchedulingError(422, { code: "INACTIVE_SHIFT_ROLE", message: "所选岗位已停用或不属于当前门店，请重新选择" });
  return role;
}
