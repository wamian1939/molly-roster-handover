import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupShiftsForCalendar } from "../../lib/calendarGrouping";
import type { Shift } from "../../types/roster";
import { CalendarEventContent } from "./CalendarEventContent";
import { GroupedShiftDialog } from "./GroupedShiftDialog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const shift: Shift = {
  id: "shift-1",
  rosterPeriodId: "period-1",
  storeId: "store-1",
  date: "2026-09-07",
  startAt: "2026-09-06T23:00:00.000Z",
  endAt: "2026-09-07T00:00:00.000Z",
  breakMinutes: 0,
  shiftRoleId: "role-front",
  roleNameSnapshot: "前场",
  roleColorSnapshot: "#2563eb",
  publicNote: null,
  internalNote: null,
  version: 1,
  shiftRole: { id: "role-front", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: [] },
  assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
};

describe("CalendarEventContent", () => {
  it("renders FullCalendar selection mirrors without requiring a shift group", () => {
    render(<CalendarEventContent isMirror timeText="09:00 - 10:00" viewType="timeGridDay" shiftGroup={undefined} />);

    expect(screen.getByText("松开创建班次")).toBeTruthy();
    expect(screen.queryByText("班次数据暂不可用")).toBeNull();
  });

  it("shows the real elapsed time of a selection crossing a repeated hour", () => {
    render(<CalendarEventContent isMirror timeText="2:00 - 3:00" viewType="timeGridDay" shiftGroup={undefined}
      timezone="Australia/Sydney" startAt={new Date("2026-04-04T15:00:00.000Z")}
      endAt={new Date("2026-04-04T17:00:00.000Z")} />);
    expect(screen.getByText("02:00 UTC+11–03:00 UTC+10")).toBeTruthy();
    expect(screen.getByText("实际 2 小时")).toBeTruthy();
  });

  it("renders a normalized group passed through extended props", () => {
    const group = groupShiftsForCalendar([shift])[0];
    render(<CalendarEventContent isMirror={false} timeText="09:00 - 10:00" viewType="timeGridWeek" shiftGroup={group} />);

    expect(screen.getByRole("article", { name: /前场.*HandoverEmployee006/ })).toBeTruthy();
  });

  it("marks a historical role that is absent from the current Evaluate catalog", () => {
    const group = groupShiftsForCalendar([shift])[0];
    render(<CalendarEventContent isMirror={false} timeText="09:00 - 10:00" viewType="timeGridWeek" shiftGroup={group} unverifiedRole />);
    expect(screen.getByRole("article", { name: /待核对/ })).toBeTruthy();
  });

  it("shows a current draft name on the event and picker while choosing the saved shift", () => {
    const resolveName = () => "Renamed Employee";
    const group = groupShiftsForCalendar([shift], resolveName)[0];
    const onChoose = vi.fn();
    render(<CalendarEventContent isMirror={false} timeText="09:00 - 10:00" viewType="timeGridWeek" shiftGroup={group} />);
    render(<GroupedShiftDialog group={group} resolveAssignmentName={resolveName} onClose={() => undefined} onChoose={onChoose} />);

    expect(screen.getByRole("article", { name: /Renamed Employee/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Renamed Employee/ }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ assignments: [expect.objectContaining({ employeeNameSnapshot: "HandoverEmployee006" })] }));
  });

  it("offers the original records when one visual group has different breaks", () => {
    const group = groupShiftsForCalendar([shift, {
      ...shift, id: "shift-2", breakMinutes: 30,
      assignments: [{ ...shift.assignments[0], id: "assignment-2", employeeId: "employee-2", employeeNameSnapshot: "HandoverEmployee019" }],
    }])[0];
    const onChoose = vi.fn();
    render(<GroupedShiftDialog group={group} onClose={() => undefined} onChoose={onChoose} />);
    expect(screen.getByText(/休息 30 分钟/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /HandoverEmployee019/ }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "shift-2", breakMinutes: 30 }));
  });

  it.each([
    ["missing stale event", undefined],
    ["incomplete temporary event", { id: "temporary", start: "09:00", end: "10:00" }],
    ["group with missing assignments", { id: "group", sourceShifts: [], assignments: undefined }],
  ])("contains a %s failure to one event", (_label, invalidGroup) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<CalendarEventContent isMirror={false} timeText="" viewType="timeGridDay" shiftGroup={invalidGroup} />);

    expect(screen.getByRole("status").textContent).toBe("班次数据暂不可用");
  });
});
