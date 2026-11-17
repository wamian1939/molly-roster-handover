import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAvailabilitySlot } from "../../lib/availability";
import { AvailabilityEditor } from "./AvailabilityEditor";

afterEach(cleanup);

describe("AvailabilityEditor", () => {
  it("does not offer next-day entry and preserves an existing overnight record", () => {
    const onChange = vi.fn();
    const slot = createAvailabilitySlot({ id: "existing", startTime: "22:00", endTime: "02:00", endNextDay: true });
    render(<AvailabilityEditor days={[{ date: "2026-10-26", slots: [slot] }]} errors={new Map()}
      timezone="Australia/Sydney" onChange={onChange} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("结束（次日）")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("2026-10-26 第 1 个时段备注"), { target: { value: "原记录" } });
    expect(onChange.mock.calls[0]?.[0][0].slots[0]).toMatchObject({ endNextDay: true, note: "原记录" });
  });
});
