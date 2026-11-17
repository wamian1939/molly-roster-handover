import { describe, expect, it } from "vitest";
import { previewPresetTimeSlots } from "../src/presetTimeSlotPreview.js";

const slot = { employeeId: "canonical-1", employeeName: "Example Worker", date: "2026-10-26",
  startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", shortcut: "AA", line: 1 };

describe("Preset Time Slot Script read only preview", () => {
  it("shows every proposed window on a duplicate local day as blocked", () => {
    const later = { ...slot, startAt: slot.endAt, endAt: "2026-10-26T13:00:00.000Z", shortcut: "BB" };
    const preview = previewPresetTimeSlots([slot, later], []);
    expect(preview.slots.map((item) => item.shortcut)).toEqual(["AA", "BB"]);
    expect(preview.summary).toEqual({ create: 0, unchanged: 0, conflict: 2 });
    expect(preview.issues.map((issue) => issue.code)).toEqual(["DUPLICATE_DAY"]);
    expect(previewPresetTimeSlots([slot, { ...later, line: 2 }], []).issues[0]?.line).toBe(2);
  });
  it("rejects overlapping windows created together across adjacent local dates", () => {
    const overnight = { ...slot, date: "2026-10-26", startAt: "2026-10-26T11:00:00.000Z",
      endAt: "2026-10-26T15:00:00.000Z" };
    const nextMorning = { ...slot, date: "2026-10-27", startAt: "2026-10-26T14:00:00.000Z",
      endAt: "2026-10-26T17:00:00.000Z" };
    const otherEmployee = { ...nextMorning, employeeId: "canonical-2" };
    const preview = previewPresetTimeSlots([overnight, nextMorning, otherEmployee], []);
    expect(preview.summary).toEqual({ create: 1, unchanged: 0, conflict: 2 });
    expect(preview.issues.map((issue) => issue.code)).toEqual(["SCRIPT_WINDOW_OVERLAP", "SCRIPT_WINDOW_OVERLAP"]);
  });

  it("allows adjacent proposed windows that meet exactly without overlapping", () => {
    const overnight = { ...slot, date: "2026-10-26", startAt: "2026-10-26T11:00:00.000Z",
      endAt: "2026-10-26T15:00:00.000Z" };
    const nextMorning = { ...slot, date: "2026-10-27", startAt: overnight.endAt,
      endAt: "2026-10-26T17:00:00.000Z" };
    expect(previewPresetTimeSlots([overnight, nextMorning], [])).toMatchObject({
      issues: [], summary: { create: 2, unchanged: 0, conflict: 0 },
    });
  });

  it("counts a new date without claiming a database write", () => {
    expect(previewPresetTimeSlots([slot], [])).toMatchObject({ summary: { create: 1, unchanged: 0, conflict: 0 }, issues: [] });
  });
  it("recognizes identical availability on a repeated paste", () => {
    const prior = { id: "row-1", employeeId: slot.employeeId, date: slot.date, status: "AVAILABLE",
      startAt: slot.startAt, endAt: slot.endAt, version: 2 };
    expect(previewPresetTimeSlots([slot], [prior])).toMatchObject({ summary: { create: 0, unchanged: 1, conflict: 0 }, issues: [] });
  });
  it("reports a recorded date as a blocking conflict without choosing a replacement", () => {
    const prior = { id: "row-1", employeeId: slot.employeeId, date: slot.date, status: "UNAVAILABLE",
      startAt: slot.startAt, endAt: slot.endAt, version: 2 };
    const result = previewPresetTimeSlots([slot], [prior]);
    expect(result.summary).toEqual({ create: 0, unchanged: 0, conflict: 1 });
    expect(result.issues[0]).toMatchObject({ line: 1, code: "ALREADY_RECORDED" });
    expect(result.slots[0]?.existingRows).toEqual([{ id: "row-1", version: 2 }]);
  });
  it("flags an overlapping prior day overnight row before submit", () => {
    const prior = { id: "overnight", employeeId: slot.employeeId, date: "2026-10-25", status: "AVAILABLE",
      startAt: "2026-10-25T22:00:00.000Z", endAt: "2026-10-26T01:00:00.000Z", version: 1 };
    expect(previewPresetTimeSlots([slot], [prior]).summary.conflict).toBe(1);
  });
  it("shows an assigned Shift that a new window would leave uncovered", () => {
    const assigned = { employeeId: slot.employeeId, date: slot.date,
      startAt: "2026-10-25T22:00:00.000Z", endAt: "2026-10-26T02:00:00.000Z" };
    const result = previewPresetTimeSlots([slot], [], [assigned]);
    expect(result.summary).toEqual({ create: 0, unchanged: 0, conflict: 1 });
    expect(result.issues[0]).toMatchObject({ line: 1, code: "SHIFT_OUTSIDE_AVAILABILITY" });
  });
  it("accepts an assigned Shift covered by the imported window", () => {
    const assigned = { employeeId: slot.employeeId, date: slot.date,
      startAt: "2026-10-26T00:00:00.000Z", endAt: "2026-10-26T02:00:00.000Z" };
    expect(previewPresetTimeSlots([slot], [], [assigned]).summary).toEqual({ create: 1, unchanged: 0, conflict: 0 });
  });
  it("does not block a new date for an unrelated prior-day Shift", () => {
    const assigned = { employeeId: slot.employeeId, date: "2026-10-25",
      startAt: "2026-10-25T08:00:00.000Z", endAt: "2026-10-25T10:00:00.000Z" };
    expect(previewPresetTimeSlots([slot], [], [assigned]).summary).toEqual({ create: 1, unchanged: 0, conflict: 0 });
  });
  it("still checks a prior-day overnight Shift that overlaps the imported window", () => {
    const assigned = { employeeId: slot.employeeId, date: "2026-10-25",
      startAt: "2026-10-25T22:00:00.000Z", endAt: "2026-10-26T01:00:00.000Z" };
    expect(previewPresetTimeSlots([slot], [], [assigned]).summary).toEqual({ create: 0, unchanged: 0, conflict: 1 });
  });
  it("checks a next-day Shift touched by a new overnight window", () => {
    const overnight = { ...slot, date: "2026-11-01",
      startAt: "2026-11-01T11:00:00.000Z", endAt: "2026-11-01T15:00:00.000Z" };
    const nextDayShift = { employeeId: slot.employeeId, date: "2026-11-02",
      startAt: "2026-11-01T14:00:00.000Z", endAt: "2026-11-01T16:00:00.000Z" };
    const preview = previewPresetTimeSlots([overnight], [], [nextDayShift]);
    expect(preview.summary).toEqual({ create: 0, unchanged: 0, conflict: 1 });
    expect(preview.issues[0]?.code).toBe("SHIFT_OUTSIDE_AVAILABILITY");
  });
});
