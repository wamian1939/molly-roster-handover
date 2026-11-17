import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarViewSwitch } from "./CalendarViewSwitch";

afterEach(cleanup);

describe("CalendarViewSwitch", () => {
  it("exposes the current view and changes it from a visible button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarViewSwitch value="timeGridWeek" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "周视图" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "日视图" }));
    expect(onChange).toHaveBeenCalledWith("timeGridDay");
  });
});
