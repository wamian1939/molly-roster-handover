import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./apiClient";
import { assertAvailabilityRows, assertSavedAvailabilityRows } from "./availabilityResponse";

const input = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-10-26", "2026-10-27"],
  entries: [{ date: "2026-10-26", status: "AVAILABLE" as const,
    startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T06:00:00.000Z",
    note: "  morning  ", source: "MANUAL" as const }] };
const saved = { id: "availability-1", storeId: "store-1", employeeId: "employee-1", date: "2026-10-26",
  status: "AVAILABLE", startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T06:00:00.000Z",
  note: "morning", source: "MANUAL", version: 1 };

describe("Availability read response", () => {
  it("accepts scoped timed and unknown rows", () => {
    const unknown = { ...saved, id: "availability-2", date: "2026-10-27",
      status: "UNKNOWN", startAt: null, endAt: null };
    expect(assertAvailabilityRows([saved, unknown], "store-1", "2026-10-26", "2026-10-27", "employee-1"))
      .toEqual([saved, unknown]);
    expect(assertAvailabilityRows([], "store-1", "2026-10-26", "2026-10-27")).toEqual([]);
  });

  it.each([
    { name: "non-array body", body: { rows: [saved] } },
    { name: "wrong store", body: [{ ...saved, storeId: "other-store" }] },
    { name: "wrong employee", body: [{ ...saved, employeeId: "employee-2" }] },
    { name: "outside date range", body: [{ ...saved, date: "2026-10-28" }] },
    { name: "duplicate row", body: [saved, saved] },
    { name: "invalid time", body: [{ ...saved, startAt: "not-a-time" }] },
    { name: "inverted window", body: [{ ...saved, endAt: "2026-10-25T22:00:00.000Z" }] },
    { name: "timed status without time", body: [{ ...saved, endAt: null }] },
    { name: "unknown with time", body: [{ ...saved, status: "UNKNOWN" }] },
    { name: "invalid version", body: [{ ...saved, version: 0 }] },
  ])("rejects $name before a page uses the rows", ({ body }) => {
    expect(() => assertAvailabilityRows(body, "store-1", "2026-10-26", "2026-10-27", "employee-1"))
      .toThrow(ApiRequestError);
  });
});

describe("Availability replacement response", () => {
  it("confirms the returned rows match the submitted entries", () => {
    expect(assertSavedAvailabilityRows([saved], input)).toEqual([saved]);
    expect(assertSavedAvailabilityRows([], { ...input, entries: [] })).toEqual([]);
  });

  it.each([
    { name: "missing row", body: [] },
    { name: "wrong store", body: [{ ...saved, storeId: "other-store" }] },
    { name: "wrong employee", body: [{ ...saved, employeeId: "employee-2" }] },
    { name: "wrong date", body: [{ ...saved, date: "2026-10-27" }] },
    { name: "wrong time", body: [{ ...saved, endAt: "2026-10-26T07:00:00.000Z" }] },
    { name: "invalid version", body: [{ ...saved, version: 0 }] },
    { name: "duplicate row", body: [saved, saved] },
  ])("keeps a mismatched successful response unconfirmed: $name", ({ body }) => {
    expect(() => assertSavedAvailabilityRows(body, input)).toThrow(ApiRequestError);
    try { assertSavedAvailabilityRows(body, input); } catch (error) {
      expect((error as ApiRequestError).status).toBe(0);
    }
  });
});
