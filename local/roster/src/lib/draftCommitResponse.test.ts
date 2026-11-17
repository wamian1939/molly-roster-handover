import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./apiClient";
import { assertDraftCommitResponse } from "./draftCommitResponse";
import type { CalendarDraftQueue, DraftShiftValue } from "./calendarDraftQueue";
import type { Shift } from "../types/roster";
import { rosterRepository } from "../services/rosterRepository";

const value: DraftShiftValue = {
  date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T06:00:00.000Z",
  breakMinutes: 30, shiftRoleId: "role-1", employeeIds: ["employee-1"], publicNote: "", internalNote: "",
};
const queue: CalendarDraftQueue = { storeId: "store-1", changes: [
  { kind: "create", clientShiftId: "created-1", value },
  { kind: "update", shiftId: "updated-1", baseVersion: 2, basePeriodId: "period-1", value },
  { kind: "delete", shiftId: "deleted-1", baseVersion: 4, basePeriodId: "period-1" },
] };
function shift(id: string, version: number): Shift {
  return { ...value, id, version, storeId: "store-1", rosterPeriodId: "period-1",
    roleNameSnapshot: "服务", roleColorSnapshot: "rose", shiftRole: {} as Shift["shiftRole"],
    assignments: [{ id: `assignment-${id}`, employeeId: "employee-1", employeeNameSnapshot: "Employee",
      employeeTypeSnapshot: "PartTime", officialScoreSnapshot: null, tierSnapshot: null }],
  };
}
const response = { saved: [shift("created-1", 1), shift("updated-1", 3)], deletedIds: ["deleted-1"] };

describe("draft commit response", () => {
  it("accepts only the exact committed creates, updates and deletes", () => {
    expect(assertDraftCommitResponse(response, "period-1", queue)).toEqual(response);
  });

  it.each([
    { saved: [response.saved[0]], deletedIds: response.deletedIds },
    { saved: response.saved, deletedIds: [] },
    { saved: [response.saved[0], shift("wrong-id", 3)], deletedIds: response.deletedIds },
    { saved: [response.saved[0], shift("updated-1", 2)], deletedIds: response.deletedIds },
    { saved: [response.saved[0], { ...response.saved[1], storeId: "other-store" }], deletedIds: response.deletedIds },
    { saved: [response.saved[0], { ...response.saved[1], rosterPeriodId: "other-period" }], deletedIds: response.deletedIds },
    { saved: response.saved, deletedIds: ["wrong-id"] },
    { saved: [response.saved[0], response.saved[0]], deletedIds: response.deletedIds },
  ])("keeps the submit uncertain when the successful HTTP body is incomplete or wrong: %#", (body) => {
    expect(() => assertDraftCommitResponse(body, "period-1", queue)).toThrow(ApiRequestError);
    try { assertDraftCommitResponse(body, "period-1", queue); } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).status).toBe(0);
    }
  });

  it("rejects a successful HTTP response with missing writes at the repository boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      saved: [response.saved[0]], deletedIds: response.deletedIds,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      await expect(rosterRepository.commitDraftPeriod("period-1", queue)).rejects.toMatchObject({ status: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
