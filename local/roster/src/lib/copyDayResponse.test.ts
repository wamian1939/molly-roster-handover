import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./apiClient";
import { assertCopyDayPreview, assertCopyDayResponse } from "./copyDayResponse";
import type { CopyDayPreview } from "../services/rosterRepository";

const preview: CopyDayPreview = {
  policy: "ALL_OR_NOTHING", shiftCount: 2, readyShifts: 2, availableAssignments: 3,
  blockedAssignments: 0, unavailableAssignments: 0, conflictingAssignments: 0,
  issues: [], canCopy: true, sourceDate: "2026-10-27", targetDate: "2026-10-28",
  sourcePeriodVersion: 4, targetPeriodVersion: 2,
};
const result = { created: 2, period: { id: "period-1", storeId: "store-1", startDate: "2026-10-26",
  endDate: "2026-11-01", status: "DRAFT", version: 3 } };

describe("Copy Day preview boundary", () => {
  it("accepts a complete preview for the requested dates", () => {
    expect(assertCopyDayPreview(preview, preview.sourceDate, preview.targetDate)).toEqual(preview);
  });

  it.each([
    { ...preview, issues: null },
    { ...preview, sourceDate: "2026-10-26" },
    { ...preview, targetDate: "2026-10-29" },
    { ...preview, targetPeriodVersion: "2" },
    { ...preview, sourcePeriodVersion: null },
    { ...preview, canCopy: true, readyShifts: 1 },
  ])("rejects an incomplete successful preview before rendering: %#", (body) => {
    expect(() => assertCopyDayPreview(body, preview.sourceDate, preview.targetDate)).toThrow(ApiRequestError);
  });

  it("allows a blocked preview with a missing source period and a specific issue", () => {
    const blocked = { ...preview, canCopy: false, readyShifts: 0, sourcePeriodVersion: null,
      issues: [{ shiftDate: preview.sourceDate, employeeName: "—", code: "SHIFT_PERIOD_MISMATCH",
        severity: "BLOCKING_ERROR", reason: "来源周期无效" }] };
    expect(assertCopyDayPreview(blocked, preview.sourceDate, preview.targetDate)).toEqual(blocked);
  });
});

describe("Copy Day response confirmation", () => {
  it("accepts the exact previewed count in the expected store and target period", () => {
    expect(assertCopyDayResponse(result, "store-1", preview)).toEqual(result);
  });

  it.each([
    { ...result, created: 1 },
    { ...result, created: 0 },
    { ...result, period: { ...result.period, storeId: "other-store" } },
    { ...result, period: { ...result.period, startDate: "2026-11-02", endDate: "2026-11-08" } },
    { ...result, period: { ...result.period, endDate: "invalid-date" } },
    { ...result, period: { ...result.period, status: "PUBLISHED" } },
    { ...result, period: { ...result.period, version: 2 } },
    { ...result, period: { ...result.period, version: 99 } },
    { created: 2 },
  ])("treats a mismatched successful HTTP body as unconfirmed: %#", (body) => {
    expect(() => assertCopyDayResponse(body, "store-1", preview)).toThrow(ApiRequestError);
    try { assertCopyDayResponse(body, "store-1", preview); } catch (error) {
      expect((error as ApiRequestError).status).toBe(0);
    }
  });

  it("expects a new target period to advance from its initial version once", () => {
    expect(assertCopyDayResponse({ ...result, period: { ...result.period, version: 2 } },
      "store-1", { ...preview, targetPeriodVersion: null })).toMatchObject({ period: { version: 2 } });
    expect(() => assertCopyDayResponse(result, "store-1", { ...preview, targetPeriodVersion: null }))
      .toThrow(ApiRequestError);
  });
});
