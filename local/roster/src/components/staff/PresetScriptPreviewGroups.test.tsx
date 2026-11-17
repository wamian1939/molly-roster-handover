import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PresetScriptPreviewGroups } from "./PresetScriptPreviewGroups";
import type { PresetScriptPreview } from "../../services/rosterRepository";

type Slot = PresetScriptPreview["slots"][number];
const slot: Slot = { employeeId: "zoe", employeeName: "HandoverEmployee011", date: "2026-11-16", startAt: "2026-11-15T23:00:00Z", endAt: "2026-11-16T06:00:00Z", shortcut: "BB", line: 1, status: "CREATE" };
afterEach(cleanup);

describe("script preview employee groups", () => {
  it("groups by canonical employee, orders each person's dates and formats store-local times", () => {
    const slots: Slot[] = [
      { ...slot, date: "2026-11-17", startAt: "2026-11-16T23:00:00Z", endAt: "2026-11-17T06:00:00Z", status: "UNCHANGED" },
      { ...slot, employeeId: "jay", employeeName: "HandoverEmployee017", status: "CONFLICT" },
      slot,
    ];
    render(<PresetScriptPreviewGroups slots={slots} timezone="Australia/Sydney" />);
    expect(screen.getAllByRole("heading", { name: "HandoverEmployee011" })).toHaveLength(1);
    const zoe = screen.getByRole("region", { name: "HandoverEmployee011 的报班预览" });
    expect(within(zoe).getAllByRole("listitem")).toHaveLength(2);
    expect([...zoe.querySelectorAll("time")].map(time => time.dateTime)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(within(zoe).getAllByText("10:00 ~ 17:00")).toHaveLength(2);
    expect(within(zoe).getByText("新增")).toBeTruthy();
    expect(within(zoe).getByText("不变")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "HandoverEmployee017 的报班预览" })).getByText("冲突")).toBeTruthy();
    expect(slots[0].date).toBe("2026-11-17");
  });
  it("keeps same-name employees separate and makes overnight endings explicit", () => {
    render(<PresetScriptPreviewGroups timezone="Australia/Sydney" slots={[
      { ...slot, employeeId: "person-a", startAt: "2026-11-16T12:00:00Z", endAt: "2026-11-16T15:00:00Z" },
      { ...slot, employeeId: "person-b" },
    ]} />);
    expect(screen.getAllByRole("region", { name: "HandoverEmployee011 的报班预览" })).toHaveLength(2);
    expect(screen.getByText("person-a")).toBeTruthy();
    expect(screen.getByText("person-b")).toBeTruthy();
    expect(screen.getByText("23:00 ~ 02:00")).toBeTruthy();
    expect(screen.getByText("结束于 2026-11-17（跨日）")).toBeTruthy();
  });
});
