import { afterEach, expect, it, vi } from "vitest";
import { ApiRequestError } from "./apiClient";
import { rosterRepository } from "../services/rosterRepository";

afterEach(() => vi.unstubAllGlobals());

const input = {
  storeId: "store-1", targetStartDate: "2037-10-12", targetEndDate: "2037-10-18",
  date: "2037-10-12", startAt: "2037-10-12T10:00:00.000Z", endAt: "2037-10-12T17:00:00.000Z",
  breakMinutes: 30, shiftRoleId: "role-1", employeeIds: ["employee-1"],
  publicNote: "", internalNote: "", clientShiftId: "created-shift",
};
const saved = {
  id: input.clientShiftId, rosterPeriodId: "period-1", storeId: input.storeId, date: input.date,
  startAt: input.startAt, endAt: input.endAt, breakMinutes: input.breakMinutes,
  shiftRoleId: input.shiftRoleId, roleNameSnapshot: "前场", roleColorSnapshot: "#334155",
  publicNote: null, internalNote: null, version: 1,
  assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Alice" }],
};

function respond(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 201 })));
}

it("does not confirm a created shift when the successful response belongs to another store or ID", async () => {
  for (const body of [{ ...saved, storeId: "store-2" }, { ...saved, id: "other-shift" }]) {
    respond(body);
    await expect(rosterRepository.createShiftWithPeriod(input)).rejects.toMatchObject({ status: 0 } satisfies Partial<ApiRequestError>);
  }
});

it("does not confirm a created shift when the successful response has different staff or time", async () => {
  for (const body of [
    { ...saved, assignments: [{ ...saved.assignments[0], employeeId: "employee-2" }] },
    { ...saved, endAt: "2037-10-12T18:00:00.000Z" },
  ]) {
    respond(body);
    await expect(rosterRepository.createShiftWithPeriod(input)).rejects.toMatchObject({ status: 0 } satisfies Partial<ApiRequestError>);
  }
});

it("does not confirm an edited shift when its period or version is wrong", async () => {
  const update = { ...input, rosterPeriodId: "period-1", version: 1 };
  for (const body of [{ ...saved, rosterPeriodId: "period-2", version: 2 }, { ...saved, version: 1 }]) {
    respond(body);
    await expect(rosterRepository.updateShift(saved.id, update)).rejects.toMatchObject({ status: 0 } satisfies Partial<ApiRequestError>);
  }
});

it("requires the requested period and a usable record for direct creation", async () => {
  const direct = { ...input, rosterPeriodId: "period-1" };
  for (const body of [{ ...saved, rosterPeriodId: "period-2" }, { ...saved, version: undefined }, {}]) {
    respond(body);
    await expect(rosterRepository.createShift(direct)).rejects.toMatchObject({ status: 0 } satisfies Partial<ApiRequestError>);
  }
  respond(saved);
  await expect(rosterRepository.createShift(direct)).resolves.toMatchObject({ id: saved.id });
});

it("accepts a matching created or version-advanced edited shift", async () => {
  respond(saved);
  await expect(rosterRepository.createShiftWithPeriod(input)).resolves.toMatchObject({ id: saved.id });
  respond({ ...saved, version: 2 });
  await expect(rosterRepository.updateShift(saved.id, { ...input, rosterPeriodId: "period-1", version: 1 })).resolves.toMatchObject({ version: 2 });
});
