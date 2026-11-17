import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { groupShiftsForCalendar, type CalendarShiftGroup } from "../../lib/calendarGrouping";
import type { Shift, ShiftAssignment } from "../../types/roster";
import { ShiftEventCard } from "./ShiftEventCard";

afterEach(cleanup);

function assignment(id: string, name: string, score: string | null = null, tier: string | null = null): ShiftAssignment {
  return { id: `assignment-${id}`, employeeId: `employee-${id}`, employeeNameSnapshot: name, employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: score, tierSnapshot: tier };
}

function shift(id: string, assignments: ShiftAssignment[], breakMinutes = 60): Shift {
  return {
    id,
    rosterPeriodId: "period-1",
    storeId: "store-1",
    date: "2026-09-07",
    startAt: "2026-09-06T23:00:00.000Z",
    endAt: "2026-09-07T07:00:00.000Z",
    breakMinutes,
    shiftRoleId: "role-all",
    roleNameSnapshot: "全岗",
    roleColorSnapshot: "#2563eb",
    publicNote: null,
    internalNote: null,
    version: 1,
    shiftRole: { id: "role-all", storeId: null, code: "all", nameZh: "全岗", colorToken: "#2563eb", requiredSkillCodes: [] },
    assignments,
  };
}

function group(shifts: Shift[]): CalendarShiftGroup {
  const result = groupShiftsForCalendar(shifts)[0];
  if (!result) throw new Error("Expected a calendar group fixture");
  return result;
}

describe("ShiftEventCard", () => {
  it.each([false,true])('marks saved and in-progress agent shifts with small text (compact=%s)',compact=>{
    const saved={...shift('agent',[assignment('1','Employee A')],0),internalNote:'智能体排班 · Full · 休息尚未安排'};
    render(<ShiftEventCard compact={compact} group={group([saved])}/>);
    expect(screen.getByText('智能体排班').tagName).toBe('SMALL');
    expect(screen.getByText('全岗')).toBeTruthy();expect(screen.queryByText(/候选 ·/)).toBeNull();
    cleanup();
    render(<ShiftEventCard compact={compact} group={group([{...saved,internalNote:null,agentPreview:true}])}/>);
    expect(screen.getByText('智能体排班').tagName).toBe('SMALL');
    expect(screen.getByRole('article').getAttribute('title')).toContain('尚未保存');
  });
  it("renders one employee with role, time, and break", () => {
    render(<ShiftEventCard group={group([shift("shift-1", [assignment("1", "HandoverEmployee007", "95", "T1")])])} />);

    const card = screen.getByRole("article", { name: /全岗.*Break: 1h.*HandoverEmployee007/ });
    expect(card.getAttribute("title")).toMatch(/全岗.*Break: 1h.*HandoverEmployee007/);
    expect(card.getAttribute("data-assignment-count")).toBe("1");
    expect(screen.getByText("HandoverEmployee007")).toBeTruthy();
  });

  it.each([
    [0, "Break: 0h"],
    [30, "Break: 0.5h"],
    [60, "Break: 1h"],
  ])("renders a clear break label for %i minutes", (minutes, label) => {
    render(<ShiftEventCard group={group([shift(`shift-${minutes}`, [assignment(String(minutes), "Employee A")], minutes)])} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("renders merged employees including a long name when score and tier are absent", () => {
    render(<ShiftEventCard group={group([
      shift("shift-1", [assignment("1", "HandoverEmployee007")]),
      shift("shift-2", [assignment("2", "Alexandria Very Long Employee Name")]),
    ])} />);

    expect(screen.getByText("HandoverEmployee007")).toBeTruthy();
    expect(screen.getByText("Alexandria Very Long Employee Name")).toBeTruthy();
    expect(screen.getByRole("article").getAttribute("data-assignment-count")).toBe("2");
  });

  it("shows a mixed break label instead of attributing one break length to everyone", () => {
    render(<ShiftEventCard group={group([
      shift("shift-1", [assignment("1", "A")], 30),
      shift("shift-2", [assignment("2", "B")], 60),
    ])} />);
    const card = screen.getByRole("article", { name: /休息时长不同.*A、B/ });
    expect(card.getAttribute("data-break-minutes")).toBeNull();
  });

  it("renders an explicit unassigned state for an empty assignments array", () => {
    render(<ShiftEventCard group={group([shift("shift-empty", [])])} />);

    expect(screen.getByText("暂未分配员工")).toBeTruthy();
  });

  it.each([
    ["2026-09-07T00:00:00.000Z", "short"],
    ["2026-09-07T03:00:00.000Z", "medium"],
    ["2026-09-07T07:00:00.000Z", "tall"],
  ])("assigns a stable duration density for end %s", (endAt, density) => {
    const value = shift(`shift-${density}`, [assignment(density, "Employee A")]);
    value.endAt = endAt;
    render(<ShiftEventCard group={group([value])} />);
    expect(screen.getByRole("article").getAttribute("data-duration-density")).toBe(density);
  });

  it("shows the BHS month role, time and break while keeping employee names accessible", () => {
    render(<ShiftEventCard compact group={group([shift("shift-month", [assignment("1", "Employee A"), assignment("2", "Employee B")])])} />);
    const card = screen.getByRole("article", { name: /Employee A.*Employee B/ });
    expect(card.getAttribute("data-duration-density")).toBe("month");
    expect(screen.getByText("全岗")).toBeTruthy();
    expect(screen.getByText("09:00 ~ 17:00 / 1h")).toBeTruthy();
    expect(card.getAttribute("title")).toContain("Employee A、Employee B");
  });
});
