import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./apiClient";
import { assertCopyPeriodPreview, assertCopyPeriodResponse } from "./copyPeriodResponse";
import type { CopyPeriodPreview } from "../services/rosterRepository";

const preview: CopyPeriodPreview = {
  policy: "ALL_OR_NOTHING", shiftCount: 2, readyShifts: 2, availableAssignments: 3,
  blockedAssignments: 0, unavailableAssignments: 0, conflictingAssignments: 0,
  issues: [], canCopy: true, targetStartDate: "2026-11-02", sourcePeriodVersion: 4,
};
const period = {
  id: "new-period", storeId: "store-1", startDate: "2026-11-02", endDate: "2026-11-08",
  cycleType: "WEEK", status: "DRAFT", version: 1, publishedAt: null,
};
const target = { startDate: "2026-11-02", endDate: "2026-11-08", cycleType: "WEEK" as const };

describe("Copy Period response confirmation", () => {
  it("accepts a complete preview and its newly created target period", () => {
    expect(assertCopyPeriodPreview(preview, target.startDate)).toEqual(preview);
    expect(assertCopyPeriodResponse(period, "store-1", "source-period", target, preview)).toEqual(period);
  });

  it.each([
    { ...preview, issues: undefined },
    { ...preview, targetStartDate: "2026-11-09" },
    { ...preview, sourcePeriodVersion: null },
    { ...preview, readyShifts: 1 },
    { ...preview, canCopy: true, issues: [{ code: "CONFLICT" }] },
  ])("rejects an invalid successful preview before copying: %#", (body) => {
    expect(() => assertCopyPeriodPreview(body, target.startDate)).toThrow(ApiRequestError);
  });

  it.each([
    {},
    { ...period, storeId: "other-store" },
    { ...period, id: "source-period" },
    { ...period, startDate: "2026-11-09", endDate: "2026-11-15" },
    { ...period, endDate: "2026-11-09" },
    { ...period, cycleType: "FORTNIGHT" },
    { ...period, status: "PUBLISHED" },
    { ...period, version: 2 },
    { ...period, publishedAt: "2026-11-02T00:00:00.000Z" },
  ])("keeps an inconsistent successful copy unconfirmed: %#", (body) => {
    expect(() => assertCopyPeriodResponse(body, "store-1", "source-period", target, preview)).toThrow(ApiRequestError);
    try { assertCopyPeriodResponse(body, "store-1", "source-period", target, preview); } catch (error) {
      expect((error as ApiRequestError).status).toBe(0);
    }
  });
});
