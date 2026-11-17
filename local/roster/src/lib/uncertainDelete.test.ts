import { expect, it, vi } from "vitest";
import type { Shift } from "../types/roster";
import { ApiRequestError } from "./apiClient";
import { findRemainingShiftAfterUncertainDelete } from "./uncertainDelete";

const gone = () => new ApiRequestError("未找到班次", 404);
const moved = { id: "second", storeId: "store-1", date: "2026-10-29" } as Shift;

it("keeps a grouped delete uncertain when another concrete shift moved off the original date", async () => {
  const read = vi.fn().mockRejectedValueOnce(gone()).mockResolvedValueOnce(moved);
  await expect(findRemainingShiftAfterUncertainDelete("store-1", ["first", "second"], read)).resolves.toBe(moved);
  expect(read.mock.calls.map((call) => call[1])).toEqual(["first", "second"]);
});

it("confirms a grouped delete only after every ID returns 404", async () => {
  const read = vi.fn().mockRejectedValue(gone());
  await expect(findRemainingShiftAfterUncertainDelete("store-1", ["first", "second"], read)).resolves.toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
});

it("does not treat a failed or mismatched readback as proof of deletion", async () => {
  await expect(findRemainingShiftAfterUncertainDelete("store-1", ["first", "second"],
    vi.fn().mockRejectedValueOnce(gone()).mockRejectedValueOnce(new ApiRequestError("断线", 0))))
    .rejects.toMatchObject({ status: 0 });
  await expect(findRemainingShiftAfterUncertainDelete("store-1", ["second"],
    vi.fn().mockResolvedValue({ ...moved, storeId: "other-store" })))
    .rejects.toMatchObject({ status: 0 });
  await expect(findRemainingShiftAfterUncertainDelete("store-1", ["second"],
    vi.fn().mockResolvedValue({ ...moved, date: "2026-10-99" })))
    .rejects.toMatchObject({ status: 0 });
});
