import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCalendarDraftQueue, stageNewShift } from "../../lib/calendarDraftQueue";
import type { Shift, ShiftRole } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";
import { CalendarDraftBar } from "./CalendarDraftBar";

const value = { date: "2026-10-20", startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T10:00:00.000Z",
  breakMinutes: 0, shiftRoleId: "role-1", employeeIds: ["employee-1"], publicNote: "", internalNote: "" };
const roles = [{ id: "role-1", nameZh: "收银" }] as ShiftRole[];
const employees = [{ id: "employee-1", displayName: "小明" }] as RosterEmployee[];

function renderBar(queue = stageNewShift(emptyCalendarDraftQueue("store-1"), "new-1", value), savedShifts: Shift[] = []) {
  const onSubmit = vi.fn();
  const onRemove = vi.fn();
  render(<CalendarDraftBar queue={queue} savedShifts={savedShifts} roles={roles} employees={employees} timezone="UTC"
    busy={false} uncertain={false} onSubmit={onSubmit} onRemove={onRemove} onDiscard={vi.fn()} onReconcile={vi.fn()} />);
  return { onSubmit, onRemove };
}

describe("CalendarDraftBar", () => {
  afterEach(cleanup);
  it("shows a pending shift and dispatches the user's submit action", () => {
    const { onSubmit, onRemove } = renderBar();
    expect(screen.getByText("待提交排班 · 1 项")).toBeTruthy();
    expect(screen.getByText(/收银 · 小明/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "统一提交" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ kind: "create", clientShiftId: "new-1" }));
  });

  it("blocks submit when a staged shift overlaps a saved employee shift", () => {
    const saved: Shift[] = [{ id: "saved-1", storeId: "store-1", rosterPeriodId: "period-1", version: 1,
      roleNameSnapshot: "收银", roleColorSnapshot: "#334155", shiftRole: roles[0]!, ...value,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "小明", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }] }];
    renderBar(undefined, saved);
    expect(screen.getByRole("button", { name: "统一提交" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/员工时间重叠/)).toBeTruthy();
  });
});
