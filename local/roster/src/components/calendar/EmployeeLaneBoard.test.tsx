import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rosterRepository } from "../../services/rosterRepository";
import type { EmployeeAvailability, RosterPeriod, Shift } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";
import { EmployeeLaneBoard } from "./EmployeeLaneBoard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const employees = [
  { id: "employee-a", displayName: "Alex", isActive: true },
  { id: "employee-b", displayName: "Blair", isActive: true },
] as RosterEmployee[];
const shift = {
  id: "shift-a", rosterPeriodId: "period-a", storeId: "store-a", date: "2026-10-05",
  startAt: "2026-10-04T22:00:00.000Z", endAt: "2026-10-05T06:00:00.000Z",
  shiftRoleId: "role-a", roleNameSnapshot: "Front", breakMinutes: 30, version: 1,
  shiftRole: { id: "role-a", code: "front", colorToken: "#2563eb" },
  assignments: [{ employeeId: "employee-a" }],
} as Shift;
const periods = [{ id: "period-a", status: "DRAFT" }] as RosterPeriod[];

describe("EmployeeLaneBoard", () => {
  it("shows current formal job colors on draft rows and refreshes after a color change", () => {
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, employees, shifts: [shift], periods,
      saving: false, onEdit: vi.fn(), formalRoleNames: new Map([["role-a", "Front"]]) };
    const { rerender } = render(<EmployeeLaneBoard {...props} formalRoleColors={new Map([["role-a", "#1e40af"]])} />);
    const card = screen.getByRole("button", { name: /Alex 2026-10-05 Front 09:00/ });
    expect(card.style.getPropertyValue("--role-color")).toBe("#1e40af");
    rerender(<EmployeeLaneBoard {...props} formalRoleColors={new Map([["role-a", "#9f1239"]])} />);
    expect(card.style.getPropertyValue("--role-color")).toBe("#9f1239");
  });

  it("keeps every saved card click-to-edit with no pointer drag handlers or grab cursor", () => {
    const onEdit = vi.fn();
    const onCreate = vi.fn();
    render(<EmployeeLaneBoard focusedDate="2026-10-05" weekStartsOn={1} employees={employees} shifts={[shift]} periods={periods}
      formalRoleNames={new Map()} saving={false} onEdit={onEdit} onCreate={onCreate} />);
    const card = screen.getByRole("button", { name: /Alex 2026-10-05 旧岗位：Front 09:00/ });
    expect(card.className).toContain("cursor-pointer");
    expect(card.className).not.toContain("cursor-grab");
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 150, clientY: 100 });
    expect(card.className).not.toContain("opacity-60");
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(onEdit).toHaveBeenCalledWith(shift);
    expect(shift.roleNameSnapshot).toBe("Front");
  });

  it("shows recorded availability and retries a nonblocking read failure", async () => {
    const availability: EmployeeAvailability[] = [{ id: "available-a", employeeId: "employee-a", storeId: "store-a", date: "2026-10-05",
      startAt: "2026-10-04T22:00:00.000Z", endAt: "2026-10-05T02:00:00.000Z", status: "AVAILABLE", note: null, source: "MANUAL", version: 1 }];
    const read = vi.spyOn(rosterRepository, "availability").mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce(availability);
    const onCreate = vi.fn();
    render(<EmployeeLaneBoard storeId="store-a" focusedDate="2026-10-05" weekStartsOn={1} timezone="Australia/Sydney"
      employees={employees} shifts={[shift]} periods={periods} saving={false} onEdit={vi.fn()} onCreate={onCreate} />);
    expect((await screen.findByRole("alert")).textContent).toContain("temporary outage");
    expect(screen.getByRole("button", { name: /Alex 2026-10-05 Front 09:00/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    const marker = await screen.findByLabelText("Alex 2026-10-05 可用时间");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(marker.textContent).toContain("可用 09:00–13:00");
    fireEvent.click(marker.querySelector("span")!);
    expect(onCreate).toHaveBeenCalledWith("employee-a", "2026-10-05");
    expect(read).toHaveBeenCalledWith("store-a", "2026-10-04", "2026-10-11");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("creates on current calendar dates regardless of legacy publication status and clicks saved cards to edit", () => {
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, employees, shifts: [shift], saving: false, onEdit, onCreate };
    const { rerender } = render(<EmployeeLaneBoard {...props} periods={periods} />);
    fireEvent.click(document.querySelector('[data-drop-target="employee-b:2026-10-06"]')!);
    expect(onCreate).toHaveBeenCalledWith("employee-b", "2026-10-06");
    fireEvent.click(screen.getByRole("button", { name: "为 Blair 在 2026-10-07 新建班次" }));
    expect(onCreate).toHaveBeenCalledWith("employee-b", "2026-10-07");
    fireEvent.click(screen.getByRole("button", { name: /Alex 2026-10-05 Front 09:00/ }));
    expect(onEdit).toHaveBeenCalledWith(shift);
    expect(onCreate).toHaveBeenCalledTimes(2);

    rerender(<EmployeeLaneBoard {...props} periods={[{ id: "period-a", status: "PUBLISHED", startDate: "2026-10-05", endDate: "2026-10-11" } as RosterPeriod]} />);
    expect(screen.getByRole("button", { name: "为 Blair 在 2026-10-07 新建班次" })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-drop-target="employee-b:2026-10-06"]')!);
    expect(onCreate).toHaveBeenCalledTimes(3);
  });

  it("blocks interactions while saving and restores click editing afterward", () => {
    const onEdit = vi.fn();
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, employees, shifts: [shift], periods, onEdit };
    const { rerender } = render(<EmployeeLaneBoard {...props} saving />);
    const card = screen.getByRole("button", { name: /Alex 2026-10-05 Front 09:00/ });
    expect(screen.getByRole("region", { name: "员工行排班" }).getAttribute("inert")).not.toBeNull();
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onEdit).not.toHaveBeenCalled();
    rerender(<EmployeeLaneBoard {...props} saving={false} />);
    expect(screen.getByRole("region", { name: "员工行排班" }).getAttribute("inert")).toBeNull();
    fireEvent.click(card);
    expect(onEdit).toHaveBeenCalledWith(shift);
  });

  it("keeps unchanged rows mounted and uses the latest employee object", () => {
    const onSelectEmployee = vi.fn();
    const otherShift = { ...shift, id: "shift-b", assignments: [{ employeeId: "employee-b" }] } as Shift;
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, periods, saving: false, onEdit: vi.fn(), onSelectEmployee };
    const { rerender } = render(<EmployeeLaneBoard {...props} employees={employees} shifts={[shift, otherShift]} />);
    const unchangedCard = screen.getByRole("button", { name: /Blair 2026-10-05 Front 09:00/ });
    const updatedEmployees = employees.map((employee) => ({ ...employee }));
    const updatedShift = { ...shift, version: 2, startAt: "2026-10-04T23:00:00.000Z", endAt: "2026-10-05T07:00:00.000Z" } as Shift;
    rerender(<EmployeeLaneBoard {...props} employees={updatedEmployees} shifts={[updatedShift, { ...otherShift }]} />);
    expect(screen.getByRole("button", { name: /Alex 2026-10-05 Front 10:00/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Blair 2026-10-05 Front 09:00/ })).toBe(unchangedCard);
    fireEvent.click(screen.getByRole("button", { name: /在时间轴查看 Blair/ }));
    expect(onSelectEmployee).toHaveBeenCalledWith(updatedEmployees[1]);
    rerender(<EmployeeLaneBoard {...props} employees={updatedEmployees} shifts={[updatedShift]} />);
    expect(screen.queryByRole("button", { name: /Blair 2026-10-05 Front/ })).toBeNull();
  });

  it("shows former employees for draft repair and published history without making them creatable", () => {
    const formerShift = { ...shift, assignments: [{ employeeId: "former-id", employeeNameSnapshot: "Former Chris" }] } as Shift;
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, employees, shifts: [formerShift], saving: false, onEdit: vi.fn() };
    const { rerender } = render(<EmployeeLaneBoard {...props} periods={periods} />);
    expect(screen.getByText("Former Chris")).toBeTruthy();
    expect(screen.getByText("不在当前在职名单 · 需重新分配")).toBeTruthy();
    expect(document.querySelector('[data-drop-target="former-id:2026-10-05"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Former Chris 2026-10-05 Front/ })).toBeTruthy();
    rerender(<EmployeeLaneBoard {...props} periods={[{ id: "period-a", status: "PUBLISHED" } as RosterPeriod]} />);
    expect(screen.getByText("不在当前在职名单 · 需重新分配")).toBeTruthy();
  });

  it("uses current employee names for editable calendar shifts and can search their old recorded names", () => {
    const publishedShift = { ...shift, assignments: [{ employeeId: "employee-a", employeeNameSnapshot: "Alex Before" }] } as Shift;
    const renamedEmployees = [{ ...employees[0], displayName: "Alex Now" }, employees[1]];
    render(<EmployeeLaneBoard focusedDate="2026-10-05" weekStartsOn={1} employees={renamedEmployees} shifts={[publishedShift]}
      periods={[{ id: "period-a", status: "PUBLISHED", startDate: "2026-10-05", endDate: "2026-10-11" } as RosterPeriod]}
      saving={false} onEdit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Alex Now 2026-10-05 Front 09:00/ })).toBeTruthy();
    expect(screen.queryByText("发布时：Alex Before")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Alex Now/ }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("员工姓名"), { target: { value: "Alex Before" } });
    expect(screen.getByRole("button", { name: /Alex Now 2026-10-05 Front 09:00/ })).toBeTruthy();
  });

  it("shows overnight continuation in the next day as a click to the original Shift", () => {
    const onEdit = vi.fn();
    const overnight = { ...shift, startAt: "2026-10-05T11:00:00.000Z", endAt: "2026-10-05T15:00:00.000Z" } as Shift;
    render(<EmployeeLaneBoard focusedDate="2026-10-05" weekStartsOn={1} timezone="Australia/Sydney" employees={employees}
      shifts={[overnight]} periods={periods} saving={false} onEdit={onEdit} />);
    expect(screen.getByRole("button", { name: /Alex 2026-10-05 Front 22:00–02:00/ })).toBeTruthy();
    const continuation = screen.getByRole("button", { name: /Alex 2026-10-05 跨天延续至 2026-10-06 Front 00:00–02:00/ });
    expect(continuation.textContent).toContain("跨天延续 · 2026-10-05 · 00:00–02:00");
    fireEvent.click(continuation);
    expect(onEdit).toHaveBeenCalledWith(overnight);
  });

  it("does not add continuation when ending at midnight and uses Adelaide DST midnight", () => {
    const midnight = { ...shift, startAt: "2026-10-05T11:00:00.000Z", endAt: "2026-10-05T13:00:00.000Z" } as Shift;
    const props = { focusedDate: "2026-10-05", weekStartsOn: 1, timezone: "Australia/Sydney", employees, periods, saving: false, onEdit: vi.fn() };
    const { rerender } = render(<EmployeeLaneBoard {...props} shifts={[midnight]} />);
    expect(screen.queryByRole("button", { name: /跨天延续至 2026-10-06/ })).toBeNull();
    const dst = { ...shift, date: "2026-10-03", startAt: "2026-10-03T13:30:00.000Z", endAt: "2026-10-03T17:30:00.000Z" } as Shift;
    rerender(<EmployeeLaneBoard {...props} focusedDate="2026-10-03" timezone="Australia/Adelaide" shifts={[dst]} />);
    expect(screen.getByRole("button", { name: /Alex 2026-10-03 跨天延续至 2026-10-04 Front 00:00–04:00/ })).toBeTruthy();
  });

  it.each([100, 300, 500])("keeps a %i-person, 300-shift roster bounded and searchable", (count) => {
    const manyEmployees = Array.from({ length: count }, (_, index) => ({ id: `employee-${index}`, displayName: `Employee ${String(index).padStart(3, "0")}`, isActive: true })) as RosterEmployee[];
    const manyShifts = Array.from({ length: 300 }, (_, index) => ({ ...shift, id: `shift-${index}`, assignments: [{ employeeId: `employee-${index % count}` }] })) as Shift[];
    render(<EmployeeLaneBoard focusedDate="2026-10-05" weekStartsOn={1} employees={manyEmployees} shifts={manyShifts} periods={periods} saving={false} onEdit={vi.fn()} />);
    expect(document.querySelectorAll('[data-drop-target$=":2026-10-05"]')).toHaveLength(60);
    fireEvent.change(screen.getByPlaceholderText("员工姓名"), { target: { value: `Employee ${String(count - 1).padStart(3, "0")}` } });
    expect(screen.getByText(`Employee ${String(count - 1).padStart(3, "0")}`)).toBeTruthy();
  });
});
