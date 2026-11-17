import { describe, expect, it } from "vitest";
import { applyAvailabilityTemplate, availabilityDraftErrors, availabilityEntries, availabilityTemplateSlots, buildAvailabilityDrafts, createAvailabilitySlot, hasContradictoryUnknownTemplateDays, type AvailabilityDayDraft } from "./availability";
import type { AvailabilityTemplate, EmployeeAvailability } from "../types/roster";

describe("multi-slot availability", () => {
  it.each([0, 1, 2, 3])("round-trips %i slots without truncation", (count) => {
    const rows = Array.from({ length: count }, (_, index) => row(index));
    const drafts = buildAvailabilityDrafts(["2026-09-07"], rows);
    expect(drafts[0]?.slots).toHaveLength(count);
    expect(availabilityEntries(drafts)).toHaveLength(count);
  });

  it("preserves all slots through template save and apply", () => {
    const days: AvailabilityDayDraft[] = [{ date: "2026-09-07", slots: [
      createAvailabilitySlot({ startTime: "09:00", endTime: "13:00" }),
      createAvailabilitySlot({ status: "UNAVAILABLE", startTime: "17:00", endTime: "22:00" }),
    ] }];
    const template = { id: "t1", storeId: "s1", name: "Split", slots: availabilityTemplateSlots(days), isActive: true, displayOrder: 0, version: 1 } satisfies AvailabilityTemplate;
    const applied = applyAvailabilityTemplate([{ date: "2026-09-14", slots: [] }], template);
    expect(applied[0]?.slots.map(({ status, startTime, endTime, source }) => ({ status, startTime, endTime, source }))).toEqual([
      { status: "AVAILABLE", startTime: "09:00", endTime: "13:00", source: "TEMPLATE" },
      { status: "UNAVAILABLE", startTime: "17:00", endTime: "22:00", source: "TEMPLATE" },
    ]);
  });

  it("identifies historical templates that mix UNKNOWN with another slot on one day", () => {
    const unknown = { dayOffset: 0, status: "UNKNOWN" as const, startTime: null, endTime: null, endNextDay: false };
    const timed = { dayOffset: 0, status: "AVAILABLE" as const, startTime: "09:00", endTime: "17:00", endNextDay: false };
    const template = { id: "legacy", storeId: "s1", name: "Legacy", slots: [unknown, timed], isActive: true, displayOrder: 0, version: 1 } satisfies AvailabilityTemplate;
    expect(hasContradictoryUnknownTemplateDays(template)).toBe(true);
    expect(hasContradictoryUnknownTemplateDays({ ...template, slots: [unknown, { ...timed, dayOffset: 1 }] })).toBe(false);
  });

  it("rejects overlapping slots", () => {
    const days = [{ date: "2026-09-07", slots: [createAvailabilitySlot({ startTime: "09:00", endTime: "14:00" }), createAvailabilitySlot({ startTime: "13:00", endTime: "17:00" })] }];
    expect(availabilityDraftErrors(days).get("2026-09-07")).toContain("不能重叠");
  });

  it("allows adjacent slots", () => {
    const days = [{ date: "2026-09-07", slots: [createAvailabilitySlot({ startTime: "09:00", endTime: "13:00" }), createAvailabilitySlot({ startTime: "13:00", endTime: "17:00" })] }];
    expect(availabilityDraftErrors(days).size).toBe(0);
  });

  it("round-trips Sydney store availability independent of the browser clock", () => {
    const rows: EmployeeAvailability[] = [{
      ...row(0),
      date: "2026-10-05",
      startAt: "2026-10-04T22:00:00.000Z",
      endAt: "2026-10-05T06:00:00.000Z",
    }];
    const drafts = buildAvailabilityDrafts(["2026-10-05"], rows, "Australia/Sydney");
    expect(drafts[0]?.slots[0]).toMatchObject({ startTime: "09:00", endTime: "17:00" });
    expect(availabilityEntries(drafts, "Australia/Sydney")[0]).toMatchObject({
      startAt: "2026-10-04T22:00:00.000Z",
      endAt: "2026-10-05T06:00:00.000Z",
    });
  });

  it("preserves the two Sydney fallback 02:30 occurrences through Staff draft reload", () => {
    const rows: EmployeeAvailability[] = [{ ...row(0), date: "2026-04-05", startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z" }];
    const drafts = buildAvailabilityDrafts(["2026-04-05"], rows, "Australia/Sydney");
    expect(drafts[0]?.slots[0]).toMatchObject({ startTime: "02:30", endTime: "02:30", startOccurrence: 0, endOccurrence: 1 });
    expect(availabilityDraftErrors(drafts, "Australia/Sydney").size).toBe(0);
    expect(availabilityEntries(drafts, "Australia/Sydney")[0]).toMatchObject({ startAt: rows[0]?.startAt, endAt: rows[0]?.endAt });
  });

  it("rejects a fallback availability slot longer than 24 actual hours", () => {
    const days = [{ date: "2026-04-05", slots: [createAvailabilitySlot({ startTime: "02:30", endTime: "02:30", endNextDay: true })] }];
    expect(availabilityDraftErrors(days, "Australia/Sydney").size).toBeGreaterThan(0);
  });

  it("accepts next-day wall clocks that increase across Sydney spring forward but stay below 24 actual hours", () => {
    const days = [{ date: "2027-10-03", slots: [createAvailabilitySlot({ startTime: "01:00", endTime: "01:30", endNextDay: true })] }];
    expect(availabilityDraftErrors(days, "Australia/Sydney").size).toBe(0);
    expect(availabilityEntries(days, "Australia/Sydney")[0]).toMatchObject({
      startAt: "2027-10-02T15:00:00.000Z", endAt: "2027-10-03T14:30:00.000Z",
    });
  });

  it("preserves an overnight slot through draft, template, and UTC payload", () => {
    const rows: EmployeeAvailability[] = [{ ...row(0), date: "2026-10-09", startAt: "2026-10-09T11:00:00.000Z", endAt: "2026-10-09T15:00:00.000Z" }];
    const draft = buildAvailabilityDrafts(["2026-10-09"], rows, "Australia/Sydney");
    expect(draft[0]?.slots[0]).toMatchObject({ startTime: "22:00", endTime: "02:00", endNextDay: true });
    expect(availabilityEntries(draft, "Australia/Sydney")[0]).toMatchObject({ startAt: rows[0]?.startAt, endAt: rows[0]?.endAt });
    const template = { id: "night", storeId: "s1", name: "Night", slots: availabilityTemplateSlots(draft), isActive: true, displayOrder: 0, version: 1 } satisfies AvailabilityTemplate;
    const applied = applyAvailabilityTemplate([{ date: "2026-10-16", slots: [] }], template);
    expect(applied[0]?.slots[0]).toMatchObject({ startTime: "22:00", endTime: "02:00", endNextDay: true, source: "TEMPLATE" });
    expect(availabilityDraftErrors(applied, "Australia/Sydney").size).toBe(0);
  });

  it("rejects cross-day overlap but accepts adjacent availability", () => {
    const days: AvailabilityDayDraft[] = [
      { date: "2026-10-09", slots: [createAvailabilitySlot({ startTime: "22:00", endTime: "02:00", endNextDay: true })] },
      { date: "2026-10-10", slots: [createAvailabilitySlot({ startTime: "01:00", endTime: "04:00" })] },
    ];
    expect(availabilityDraftErrors(days).get("2026-10-10")).toContain("不能重叠");
    days[1]!.slots[0]!.startTime = "02:00";
    expect(availabilityDraftErrors(days).size).toBe(0);
  });
});

function row(index: number): EmployeeAvailability {
  const startHour = index * 3;
  return { id: `a${index}`, employeeId: "e1", storeId: "s1", date: "2026-09-07", status: "AVAILABLE", startAt: `2026-09-07T${String(startHour).padStart(2, "0")}:00:00.000Z`, endAt: `2026-09-07T${String(startHour + 2).padStart(2, "0")}:00:00.000Z`, note: null, source: "MANUAL", version: 1 };
}
