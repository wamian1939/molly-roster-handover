import { DateTime } from "luxon";
import { addCalendarDays, DEFAULT_STORE_TIMEZONE, storeDateTimeCandidates, storeParts } from "./storeTime";
import type { AvailabilitySource, AvailabilityStatus, AvailabilityTemplate, AvailabilityTemplateSlot, EmployeeAvailability } from "../types/roster";

export type AvailabilitySlotDraft = {
  id: string;
  status: Exclude<AvailabilityStatus, "UNKNOWN">;
  startTime: string;
  endTime: string;
  endNextDay: boolean;
  startOccurrence: number;
  endOccurrence: number;
  note: string;
  source: AvailabilitySource;
};

export type AvailabilityDayDraft = { date: string; slots: AvailabilitySlotDraft[] };

let draftSequence = 0;

export function createAvailabilitySlot(overrides: Partial<AvailabilitySlotDraft> = {}): AvailabilitySlotDraft {
  draftSequence += 1;
  return {
    id: `availability-slot-${draftSequence}`,
    status: "AVAILABLE",
    startTime: "09:00",
    endTime: "17:00",
    endNextDay: false,
    startOccurrence: 0,
    endOccurrence: 0,
    note: "",
    source: "MANUAL",
    ...overrides,
  };
}

export function buildAvailabilityDrafts(dates: string[], rows: EmployeeAvailability[], timezone = DEFAULT_STORE_TIMEZONE): AvailabilityDayDraft[] {
  const byDate = new Map<string, EmployeeAvailability[]>();
  for (const row of rows) {
    if (row.status === "UNKNOWN" || !row.startAt || !row.endAt) continue;
    const current = byDate.get(row.date) ?? [];
    current.push(row);
    byDate.set(row.date, current);
  }
  return dates.map((date) => ({
    date,
    slots: (byDate.get(date) ?? [])
      .sort((left, right) => left.startAt!.localeCompare(right.startAt!))
      .map((row) => createAvailabilitySlot({
        id: row.id,
        status: row.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
        startTime: storeParts(row.startAt!, timezone).time,
        endTime: storeParts(row.endAt!, timezone).time,
        endNextDay: storeParts(row.endAt!, timezone).date !== date,
        startOccurrence: occurrenceForInstant(date, storeParts(row.startAt!, timezone).time, row.startAt!, timezone),
        endOccurrence: occurrenceForInstant(storeParts(row.endAt!, timezone).date, storeParts(row.endAt!, timezone).time, row.endAt!, timezone),
        note: row.note ?? "",
        source: row.source,
      })),
  }));
}

export function applyAvailabilityTemplate(days: AvailabilityDayDraft[], template: AvailabilityTemplate): AvailabilityDayDraft[] {
  return days.map((day, index) => {
    const exact = template.slots.filter((slot) => slot.dayOffset === index);
    const slots = exact.length || index < 7 ? exact : template.slots.filter((slot) => slot.dayOffset === index % 7);
    return {
      ...day,
      slots: slots
        .filter(isTimedTemplateSlot)
        .sort((left, right) => left.startTime!.localeCompare(right.startTime!))
        .map((slot) => createAvailabilitySlot({
          status: slot.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
          startTime: slot.startTime!,
          endTime: slot.endTime!,
          endNextDay: slot.endNextDay ?? false,
          source: "TEMPLATE",
        })),
    };
  });
}

export function hasContradictoryUnknownTemplateDays(template: AvailabilityTemplate): boolean {
  const countsByDay = new Map<number, number>();
  for (const slot of template.slots) countsByDay.set(slot.dayOffset, (countsByDay.get(slot.dayOffset) ?? 0) + 1);
  return template.slots.some((slot) => slot.status === "UNKNOWN" && countsByDay.get(slot.dayOffset)! > 1);
}

export function availabilityTemplateSlots(days: AvailabilityDayDraft[]): AvailabilityTemplateSlot[] {
  return days.flatMap((day, dayOffset) => day.slots.map((slot) => ({
    dayOffset,
    status: slot.status,
    startTime: slot.startTime,
    endTime: slot.endTime,
    endNextDay: slot.endNextDay,
  })));
}

export function availabilityEntries(days: AvailabilityDayDraft[], timezone = DEFAULT_STORE_TIMEZONE) {
  return days.flatMap((day) => day.slots.map((slot) => ({
    date: day.date,
    status: slot.status,
    startAt: slotInstant(day.date, slot.startTime, slot.startOccurrence, timezone).toISOString(),
    endAt: slotInstant(slot.endNextDay ? addCalendarDays(day.date, 1) : day.date, slot.endTime, slot.endOccurrence, timezone).toISOString(),
    note: slot.note,
    source: slot.source,
  })));
}

export function availabilityOccurrences(date: string, time: string, timezone: string) {
  if (!time) return [];
  try {
    return storeDateTimeCandidates(date, time, timezone).map((instant, index) => ({
      value: String(index),
      label: `${index === 0 ? "第一次" : "第二次"} ${time} UTC${DateTime.fromJSDate(instant, { zone: timezone }).toFormat("ZZ").replace(/:00$/, "")}`,
    }));
  } catch { return []; }
}

export function hasNonportableAvailabilityOccurrence(days: AvailabilityDayDraft[]) {
  return days.some((day) => day.slots.some((slot) => slot.startOccurrence !== 0 || slot.endOccurrence !== 0));
}

function occurrenceForInstant(date: string, time: string, instant: string, timezone: string) {
  return storeDateTimeCandidates(date, time, timezone).findIndex((candidate) => candidate.getTime() === Date.parse(instant));
}

function slotInstant(date: string, time: string, occurrence: number, timezone: string) {
  const instant = storeDateTimeCandidates(date, time, timezone)[occurrence];
  if (!instant) throw new Error("请选择有效的夏令时回拨时间");
  return instant;
}

export function availabilityDraftErrors(days: AvailabilityDayDraft[], timezone = DEFAULT_STORE_TIMEZONE) {
  const errors = new Map<string, string>();
  const intervals: Array<{ date: string; start: Date; end: Date }> = [];
  for (const day of days) {
    for (const slot of day.slots) {
      if (!slot.startTime || !slot.endTime) {
        errors.set(day.date, "请选择有效的开始和结束时间");
        continue;
      }
      try {
        const start = slotInstant(day.date, slot.startTime, slot.startOccurrence, timezone);
        const end = slotInstant(slot.endNextDay ? addCalendarDays(day.date, 1) : day.date, slot.endTime, slot.endOccurrence, timezone);
        if (!(start < end)) { errors.set(day.date, "结束时间必须晚于开始时间"); continue; }
        if (end.getTime() - start.getTime() > 86_400_000) { errors.set(day.date, "可用时间最长为实际经过的 24 小时"); continue; }
        intervals.push({ date: day.date, start, end });
      } catch (cause) {
        errors.set(day.date, cause instanceof Error ? cause.message : "时段包含无效的门店本地时间");
      }
    }
  }
  intervals.sort((left, right) => left.start.getTime() - right.start.getTime());
  let latestEnd = intervals[0]?.end;
  for (let index = 1; index < intervals.length; index += 1) {
    if (latestEnd && intervals[index]!.start < latestEnd) errors.set(intervals[index]!.date, "可用时间段不能重叠，包括跨日时段");
    if (!latestEnd || intervals[index]!.end > latestEnd) latestEnd = intervals[index]!.end;
  }
  return errors;
}

function isTimedTemplateSlot(slot: AvailabilityTemplateSlot) {
  return slot.status !== "UNKNOWN" && Boolean(slot.startTime) && Boolean(slot.endTime);
}
