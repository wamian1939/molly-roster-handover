import type { AvailabilityTemplate, ShiftTemplate } from "../types/roster";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const clock = (value: unknown): value is string => typeof value === "string"
  && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function templateBase(value: unknown, storeId: string): value is Record<string, unknown> {
  return record(value) && text(value.id) && value.storeId === storeId && text(value.name)
    && typeof value.isActive === "boolean" && whole(value.displayOrder)
    && whole(value.version) && value.version > 0;
}

function checkedList<T extends { id: string }>(value: unknown, storeId: string, kind: string,
  valid: (item: unknown, storeId: string) => item is T): T[] {
  if (!Array.isArray(value) || !value.every((item) => valid(item, storeId))
    || new Set(value.map((item: T) => item.id)).size !== value.length) {
    throw new Error(`${kind}返回的数据无效或不属于当前门店，请刷新后重试`);
  }
  return value;
}

function shiftTemplate(value: unknown, storeId: string): value is ShiftTemplate {
  return templateBase(value, storeId) && clock(value.startTime) && clock(value.endTime)
    && whole(value.breakMinutes) && value.breakMinutes >= 0
    && (value.shiftRoleId === null || text(value.shiftRoleId))
    && (value.shiftRole === null || (record(value.shiftRole) && text(value.shiftRole.nameZh)));
}

function availabilitySlot(value: unknown): boolean {
  return record(value) && whole(value.dayOffset) && value.dayOffset >= 0 && value.dayOffset <= 13
    && (value.status === "AVAILABLE" || value.status === "UNAVAILABLE" || value.status === "UNKNOWN")
    && (value.startTime === null || clock(value.startTime))
    && (value.endTime === null || clock(value.endTime))
    && (value.endNextDay === undefined || typeof value.endNextDay === "boolean");
}

function availabilityTemplate(value: unknown, storeId: string): value is AvailabilityTemplate {
  return templateBase(value, storeId) && Array.isArray(value.slots) && value.slots.every(availabilitySlot);
}

export const checkedShiftTemplates = (value: unknown, storeId: string): ShiftTemplate[] =>
  checkedList(value, storeId, "班次模板", shiftTemplate);

export const checkedAvailabilityTemplates = (value: unknown, storeId: string): AvailabilityTemplate[] =>
  checkedList(value, storeId, "可用时间模板", availabilityTemplate);

export class TemplateMutationResponseError extends Error {
  constructor() {
    super("服务器返回的模板信息与本次操作不符。请刷新列表核对是否已保存，避免重复提交。");
  }
}

type ShiftSubmission = Pick<ShiftTemplate, "storeId" | "name" | "startTime" | "endTime" | "breakMinutes" | "shiftRoleId">
  & Partial<Pick<ShiftTemplate, "id" | "isActive" | "displayOrder" | "version">>;
type AvailabilitySubmission = Pick<AvailabilityTemplate, "storeId" | "name" | "slots">
  & Partial<Pick<AvailabilityTemplate, "id" | "isActive" | "displayOrder" | "version">>;

export function checkedSavedShiftTemplate(value: unknown, submitted: ShiftSubmission): ShiftTemplate {
  if (!shiftTemplate(value, submitted.storeId)
    || (submitted.id !== undefined && value.id !== submitted.id)
    || value.version !== (submitted.version === undefined ? 1 : submitted.version + 1)
    || value.name !== submitted.name.trim()
    || value.startTime !== submitted.startTime || value.endTime !== submitted.endTime
    || value.breakMinutes !== submitted.breakMinutes
    || value.shiftRoleId !== (submitted.shiftRoleId || null)
    || value.isActive !== (submitted.isActive ?? true)
    || value.displayOrder !== (submitted.displayOrder ?? 0)) {
    throw new TemplateMutationResponseError();
  }
  return value;
}

function sameSlots(saved: AvailabilityTemplate["slots"], submitted: AvailabilityTemplate["slots"]): boolean {
  return saved.length === submitted.length && saved.every((slot, index) => {
    const expected = submitted[index]!;
    return slot.dayOffset === expected.dayOffset && slot.status === expected.status
      && slot.startTime === expected.startTime && slot.endTime === expected.endTime
      && (slot.endNextDay ?? false) === (expected.endNextDay ?? false);
  });
}

export function checkedSavedAvailabilityTemplate(value: unknown, submitted: AvailabilitySubmission): AvailabilityTemplate {
  if (!availabilityTemplate(value, submitted.storeId)
    || (submitted.id !== undefined && value.id !== submitted.id)
    || value.version !== (submitted.version === undefined ? 1 : submitted.version + 1)
    || value.name !== submitted.name.trim()
    || value.isActive !== (submitted.isActive ?? true)
    || value.displayOrder !== (submitted.displayOrder ?? 0)
    || !sameSlots(value.slots, submitted.slots)) {
    throw new TemplateMutationResponseError();
  }
  return value;
}
