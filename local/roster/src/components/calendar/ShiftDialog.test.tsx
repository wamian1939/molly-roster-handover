import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shift } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";
import { ShiftDialog } from "./ShiftDialog";

const role = { id: "front", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: ["order-taking"] };
const barRole = { id: "bar", storeId: null, code: "bar", nameZh: "水吧", colorToken: "#0f766e", requiredSkillCodes: [] };
const kitchenRole = { id: "kitchen", storeId: null, code: "kitchen", nameZh: "后场", colorToken: "#c2410c", requiredSkillCodes: ["steeping"] };

afterEach(cleanup);

function employee(index: number): RosterEmployee {
  return {
    id: `employee-${index}`,
    displayName: index === 499 ? "Target Employee" : `Employee ${String(index).padStart(3, "0")}`,
    employeeType: "REGULAR",
    employmentType: "PartTime",
    storeId: "store-1",
    storeName: "Hurstville",
    isActive: true,
    officialScore: { score: 82.4, tier: "T2", roundId: "round-1", closedAt: "2026-09-01T00:00:00Z" },
    skillSummary: {
      overallPercent: 80,
      backOfHousePercent: 60,
      waterBarPercent: 70,
      frontOfHousePercent: 90,
      qualifiedSkillCodes: ["order-taking"],
      skills: [],
      operations: { opening: "CAN_DO", closing: "CAN_DO", weeklyCleaning: "UNKNOWN" },
    },
  };
}

describe("ShiftDialog", () => {
  it("explains an empty verified role catalog and blocks saving without inventing a role", () => {
    const onSave = vi.fn();
    render(<ShiftDialog draft={{ date: "2026-10-26", start: new Date("2026-10-25T23:00:00.000Z"),
      end: new Date("2026-10-26T00:00:00.000Z") }} roles={[]} templates={[]}
      employees={[employee(1)]} availability={[]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney"
      onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByText(/当前门店没有已核对的可排班岗位/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存班次" }).hasAttribute("disabled")).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires an explicit Job choice for a new Day Shift and preserves it on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00.000Z"),
      end: new Date("2026-09-07T10:00:00.000Z"), employeeId: "employee-1" }} roles={[role, barRole]} templates={[]}
      employees={[employee(1)]} availability={[availableForEmployeeOne()]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={onSave} />);
    expect((screen.getByRole("radio", { name: "前场" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("radio", { name: "水吧" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("请选择班次岗位");
    await user.click(screen.getByRole("radio", { name: "水吧" }));
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ shiftRoleId: barRole.id }));
  });

  it("marks only the selected-day available employee as schedulable", () => {
    const monday = { ...availableForEmployeeOne(), id: "monday-window", date: "2026-10-26",
      startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z" };
    const tuesday = { ...availableForEmployeeOne(), id: "tuesday-window", employeeId: "employee-2", date: "2026-10-27",
      startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T11:00:00.000Z" };
    render(<ShiftDialog draft={{ date: "2026-10-26", start: new Date("2026-10-25T23:00:00.000Z"),
      end: new Date("2026-10-25T23:30:00.000Z") }} roles={[{ ...role, formalJobId: "job-front" }]} templates={[]}
      employees={[{ ...employee(1), positions: [{ id: "job-front", code: "front", name: "前场" }] }, { ...employee(2), positions: [{ id: "job-front", code: "front", name: "前场" }] }]} availability={[monday, tuesday]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney"
      onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    const mondayEmployee = screen.getByRole("button", { name: /Employee 001/ });
    const tuesdayEmployee = screen.getByRole("button", { name: /Employee 002/ });
    expect(mondayEmployee.getAttribute("data-availability")).toBe("available");
    expect(tuesdayEmployee.getAttribute("data-availability")).toBe("unavailable");
    expect((tuesdayEmployee as HTMLButtonElement).disabled).toBe(true);
    expect(tuesdayEmployee.getAttribute("aria-label")).toContain("可用时间未知");
    expect(tuesdayEmployee.textContent).not.toContain("可用时间未知");
  });

  it("uses the selected database role colour for available staff and keeps unavailable staff gray", () => {
    const front = { ...role, formalJobId: "job-front" };
    const bar = { ...barRole, formalJobId: "job-bar" };
    const bothPositions = [
      { id: "job-front", code: "front", name: "前场" },
      { id: "job-bar", code: "bar", name: "水吧" },
    ];
    render(<ShiftDialog draft={{ date: "2026-10-26", start: new Date("2026-10-25T23:00:00.000Z"),
      end: new Date("2026-10-25T23:30:00.000Z") }} roles={[front, bar]} templates={[]}
      employees={[{ ...employee(1), positions: bothPositions }, { ...employee(2), positions: bothPositions }]}
      availability={[{ ...availableForEmployeeOne(), date: "2026-10-26", startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z" }]}
      existingShifts={[]} workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney"
      onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    const available = screen.getByRole("button", { name: /Employee 001/ });
    const unavailable = screen.getByRole("button", { name: /Employee 002/ });
    expect(available.getAttribute("data-availability")).toBe("available");
    expect(available.style.getPropertyValue("--role-color")).toBe("#2563eb");
    expect(unavailable.getAttribute("data-availability")).toBe("unavailable");

    fireEvent.click(screen.getByRole("radio", { name: "水吧" }));
    expect(available.style.getPropertyValue("--role-color")).toBe("#0f766e");
    expect(unavailable.getAttribute("data-availability")).toBe("unavailable");
  });

  it("closes an unchanged historical-role Shift without a false discard warning", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "legacy-shift", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: barRole.id, shiftRole: barRole,
      roleNameSnapshot: barRole.nameZh, roleColorSnapshot: barRole.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    const onClose = vi.fn();
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]}
      templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={onClose} onSave={vi.fn()} />);
    expect(screen.getByText(/旧岗位已不在 Evaluate 正式清单中/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirms leaving an existing Shift while retaining unsaved form input", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: role.id, shiftRole: role,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    const onClose = vi.fn();
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]}
      templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={onClose} onSave={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: "公开备注" }), "Unsaved note");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("未保存");
    expect(document.activeElement?.textContent).toBe("继续编辑");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("放弃修改");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("继续编辑");
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect((screen.getByRole("textbox", { name: "公开备注" }) as HTMLTextAreaElement).value).toBe("Unsaved note");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not discard edited fields when switching to Copy or Repeat", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: role.id, shiftRole: role,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    const onCopy = vi.fn();
    const onRepeat = vi.fn();
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]}
      templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()} onCopy={onCopy} onRepeat={onRepeat} />);
    expect(screen.getByRole("button", { name: "复制班次" }).closest("details")?.open).toBe(false);
    await user.click(screen.getByRole("button", { name: "其他班次操作" }));
    await user.click(screen.getByRole("button", { name: "复制班次" }));
    expect(onCopy).toHaveBeenCalledOnce();
    await user.type(screen.getByRole("textbox", { name: "公开备注" }), "Unsaved note");
    await user.click(screen.getByRole("button", { name: "其他班次操作" }));
    await user.click(screen.getByRole("button", { name: "重复班次" }));
    expect(onRepeat).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("已保存");
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect((screen.getByRole("textbox", { name: "公开备注" }) as HTMLTextAreaElement).value).toBe("Unsaved note");
    await user.click(screen.getByRole("button", { name: "其他班次操作" }));
    await user.click(screen.getByRole("button", { name: "复制班次" }));
    expect(onCopy).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "放弃修改并复制" }));
    expect(onCopy).toHaveBeenCalledTimes(2);
    cleanup();
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]}
      templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()} onCopy={onCopy} onRepeat={onRepeat} />);
    await user.type(screen.getByRole("textbox", { name: "公开备注" }), "Another note");
    await user.click(screen.getByRole("button", { name: "其他班次操作" }));
    await user.click(screen.getByRole("button", { name: "重复班次" }));
    await user.click(screen.getByRole("button", { name: "放弃修改并重复" }));
    expect(onRepeat).toHaveBeenCalledOnce();
  });

  it("requires an official role choice before saving a legacy draft", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "legacy-shift", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: barRole.id, shiftRole: barRole,
      roleNameSnapshot: barRole.nameZh, roleColorSnapshot: barRole.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]}
      templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={onSave} />);
    const save = screen.getByRole("button", { name: /保存班次/ });
    expect(screen.getByText(/旧岗位已不在 Evaluate 正式清单中/)).toBeTruthy();
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "前场" }));
    expect(save.hasAttribute("disabled")).toBe(false);
    await user.click(save);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].shiftRoleId).toBe(role.id);
  });

  it("blocks a selected employee when a refreshed target snapshot reveals an overlapping Shift", () => {
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const competing = { id: "other-shift", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: role.id, shiftRole: role,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    const props = { draft: { date: "2026-09-07", start, end, employeeId: "employee-1" }, roles: [role], templates: [],
      employees: [employee(1)], availability: [availableForEmployeeOne()], workforceGeneratedAt: null,
      saving: false, timezone: "UTC", onClose: vi.fn(), onSave: vi.fn() };
    const { rerender } = render(<ShiftDialog {...props} existingShifts={[]} />);
    const save = screen.getByRole("button", { name: /保存班次/ });
    expect(save.hasAttribute("disabled")).toBe(false);
    rerender(<ShiftDialog {...props} existingShifts={[competing]} />);
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Employee 001 在该时间已有班次");
    rerender(<ShiftDialog {...props} existingShifts={[]} />);
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("disables deletion when the open shift is stale", () => {
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift: Shift = { id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: role.id, shiftRole: role,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, version: 1,
      breakMinutes: 0, assignments: [], publicNote: null, internalNote: null };
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]} templates={[]}
      employees={[employee(1)]} availability={[]} existingShifts={[existingShift]} workforceGeneratedAt={null}
      saving={false} staleVersion timezone="UTC" onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "删除班次" }).hasAttribute("disabled")).toBe(true);
  });

  it("repairs a draft assignment after its employee leaves the current Evaluate workforce", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "old-shift", date: "2026-09-07", startAt: start.toISOString(), endAt: end.toISOString(),
      shiftRoleId: role.id, breakMinutes: 0, assignments: [{ employeeId: "former-employee", employeeNameSnapshot: "Former Bob" }], publicNote: null, internalNote: null } as Shift;
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[role]} templates={[]}
      employees={[employee(1)]} availability={[availableForEmployeeOne()]} existingShifts={[existingShift]}
      workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole("alert").textContent).toContain("Former Bob");
    await user.click(screen.getByRole("button", { name: /保存班次/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/已选员工不在当前门店可排班名单中/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "移除 Former Bob" }));
    await user.click(screen.getByRole("button", { name: /Employee 001/ }));
    await user.click(screen.getByRole("button", { name: /保存班次/ }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].employeeIds).toEqual(["employee-1"]);
  });

  it("lets the picker filter official Evaluate positions independently from Shift Role skills", async () => {
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role]} templates={[]} employees={[
        { ...employee(1), positions: [{ id: "job-water", code: "WATER", name: "水吧" }] },
        { ...employee(2), skillSummary: { ...employee(2).skillSummary, qualifiedSkillCodes: ["order-taking"] } },
      ]} existingShifts={[]} availability={[]} workforceGeneratedAt={null} saving={false}
      onClose={vi.fn()} onSave={vi.fn()}
    />);
    fireEvent.click(screen.getByText("更多员工筛选"));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "筛选正式岗位" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: "水吧" }), { key: "Enter" });
    expect(within(screen.getByLabelText("员工列表")).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Employee 001")).toBeTruthy();
    expect(screen.queryByText("Employee 002")).toBeNull();
  });

  it("does not treat a matching skill as a confirmed formal job assignment", () => {
    const verifiedRole = { ...role, formalJobId: "job-front" };
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[verifiedRole, { ...barRole, formalJobId: "job-water" }]} templates={[]} employees={[
        { ...employee(1), positions: [{ id: "job-water", code: "bar", name: "水吧" }] },
        { ...employee(2), positions: [{ id: "job-front", code: "front", name: "前场" }] },
      ]} existingShifts={[]} availability={[availableForEmployeeOne(), { ...availableForEmployeeOne(), id: "available-2", employeeId: "employee-2" }]}
      workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    expect(screen.getByText("当前岗位 1 · 可排 1 / 筛选 2 人")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Employee 001/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示全部员工" }));
    const unconfirmed = screen.getByRole("button", { name: /Employee 001/ });
    const confirmed = screen.getByRole("button", { name: /Employee 002/ });
    expect(unconfirmed.getAttribute("aria-label")).toContain("当前班次正式岗位资格未确认");
    expect(within(unconfirmed).getByText("不可排")).toBeTruthy();
    expect(confirmed.getAttribute("data-availability")).toBe("available");
    expect(within(confirmed).queryByText("不可排")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "水吧" }));
    expect(screen.getByText("当前岗位 1 · 可排 1 / 筛选 2 人")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Employee 001/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Employee 002/ })).toBeNull();
  });

  it("saves the chosen shift role for an employee with multiple formal positions and ranks available staff first", async () => {
    const user = userEvent.setup();
    const front = { ...role, formalJobId: "job-front" };
    const bar = { ...barRole, formalJobId: "job-water" };
    const bothPositions = [{ id: "job-front", code: "front", name: "前场" }, { id: "job-water", code: "bar", name: "水吧" }];
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00.000Z"), end: new Date("2026-09-07T10:00:00.000Z") }}
      roles={[front, bar]} templates={[]}
      employees={[{ ...employee(1), positions: bothPositions }, { ...employee(2), positions: bothPositions }]}
      availability={[{ ...availableForEmployeeOne(), id: "available-2", employeeId: "employee-2" }]}
      existingShifts={[]} workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={onSave}
    />);

    await user.click(screen.getByRole("radio", { name: "前场" }));
    const staffList = screen.getByLabelText("员工列表");
    const candidates = within(staffList).getAllByRole("button");
    expect(candidates[0]?.textContent).toContain("Employee 002");
    expect(candidates[0]?.getAttribute("data-availability")).toBe("available");
    expect(candidates[1]?.getAttribute("data-availability")).toBe("unavailable");
    await user.click(candidates[0]);
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ shiftRoleId: front.id, employeeIds: ["employee-2"] }));

    await user.click(screen.getByRole("radio", { name: "水吧" }));
    expect(screen.getByRole("button", { name: /Employee 002/ }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ shiftRoleId: bar.id, employeeIds: ["employee-2"] }));
  });

  it("keeps available employee cards in place when selecting a later card", async () => {
    const user = userEvent.setup();
    const front = { ...role, formalJobId: "job-front" };
    const position = { id: "job-front", code: "front", name: "Front" };
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00.000Z"), end: new Date("2026-09-07T10:00:00.000Z") }}
      roles={[front]} templates={[]}
      employees={[1, 2, 3].map((index) => ({ ...employee(index), positions: [position] }))}
      availability={[1, 2, 3].map((index) => ({ ...availableForEmployeeOne(), id: `available-${index}`, employeeId: `employee-${index}` }))}
      existingShifts={[]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()}
    />);

    await user.click(screen.getByRole("radio", { name: front.nameZh }));
    const staffList = screen.getByLabelText("员工列表");
    const names = () => within(staffList).getAllByRole("button").map((card) => card.querySelector(".shift-staff-card-name")?.textContent);
    expect(names()).toEqual(["Employee 001", "Employee 002", "Employee 003"]);
    await user.click(screen.getByRole("button", { name: /Employee 003/ }));
    expect(names()).toEqual(["Employee 001", "Employee 002", "Employee 003"]);
    expect(screen.getByRole("button", { name: /Employee 003/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("edits all assignments in a merged block without treating sibling source rows as conflicts", async () => {
    const user = userEvent.setup();
    const start = "2026-09-07T09:00:00.000Z";
    const end = "2026-09-07T10:00:00.000Z";
    const first = { id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07", startAt: start, endAt: end,
      shiftRoleId: "front", shiftRole: role, roleNameSnapshot: "前场", roleColorSnapshot: role.colorToken, breakMinutes: 0, version: 1,
      publicNote: null, internalNote: null,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }] } as Shift;
    const second = { ...first, id: "shift-2", assignments: [{ ...first.assignments[0], id: "assignment-2", employeeId: "employee-2", employeeNameSnapshot: "Employee 002" }] };
    const merged = { ...first, assignments: [...first.assignments, ...second.assignments] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog draft={{ date: "2026-09-07", start: new Date(start), end: new Date(end) }}
      existingShift={merged} relatedShiftIds={[first.id, second.id]} roles={[role]} templates={[]} employees={[employee(1), employee(2)]}
      availability={[availableForEmployeeOne(), { ...availableForEmployeeOne(), id: "available-2", employeeId: "employee-2" }]}
      existingShifts={[first, second]} workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.queryByText(/在该时间已有班次/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "保存班次（2人）" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employeeIds: ["employee-1", "employee-2"] }));
  });

  it("keeps a new Day shift's staff list empty until a Job is selected", () => {
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[{ ...role, formalJobId: "job-front" }]} templates={[]}
      employees={[{ ...employee(1), positions: [{ id: "job-front", code: "front", name: "前场" }] }, employee(2)]}
      availability={[availableForEmployeeOne()]} existingShifts={[]} workforceGeneratedAt={null} saving={false}
      timezone="UTC" onClose={vi.fn()} onSave={vi.fn()}
    />);
    expect(screen.getByText("当前岗位 0 · 可排 0 / 筛选 2 人")).toBeTruthy();
    expect(screen.getByText(/请先选择班次岗位/)).toBeTruthy();
    expect(within(screen.getByLabelText("员工列表")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByPlaceholderText("搜索员工姓名")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示全部员工" }));
    expect(screen.getByPlaceholderText("搜索员工姓名")).toBeTruthy();
    expect(within(screen.getByLabelText("员工列表")).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    expect(screen.getByText("当前岗位 1 · 可排 1 / 筛选 2 人")).toBeTruthy();
    expect(within(screen.getByLabelText("员工列表")).getAllByRole("button")).toHaveLength(1);
  });

  it("shows formal Job holders even when their time is unavailable, but cannot select them", () => {
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[{ ...role, formalJobId: "job-front" }]} templates={[]}
      employees={[
        { ...employee(1), positions: [{ id: "job-front", code: "front", name: "前场" }] },
        { ...employee(2), positions: [{ id: "job-front", code: "front", name: "前场" }] },
      ]}
      availability={[availableForEmployeeOne()]} existingShifts={[]} workforceGeneratedAt={null} saving={false}
      timezone="UTC" onClose={vi.fn()} onSave={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    const staffList = screen.getByLabelText("员工列表");
    expect(within(staffList).getAllByRole("button")).toHaveLength(2);
    expect((within(staffList).getByRole("button", { name: /Employee 001/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(staffList).getByRole("button", { name: /Employee 002/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("当前岗位 2 · 可排 1 / 筛选 2 人")).toBeTruthy();
  });

  it("does not assign an unqualified employee from the diagnostic all-staff view", () => {
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[{ ...role, formalJobId: "job-front" }]} templates={[]}
      employees={[{ ...employee(1), positions: [{ id: "job-front", code: "front", name: "前场" }] }, employee(2)]}
      availability={[availableForEmployeeOne(), { ...availableForEmployeeOne(), id: "available-2", employeeId: "employee-2" }]}
      existingShifts={[]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: "显示全部员工" }));
    expect((screen.getByRole("button", { name: /Employee 001/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    fireEvent.click(screen.getByRole("button", { name: "显示全部员工" }));
    expect((screen.getByRole("button", { name: /Employee 001/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Employee 002/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an existing assignee visible when current eligibility no longer matches", () => {
    const verifiedRole = { ...role, formalJobId: "job-front" };
    const start = new Date("2026-09-07T09:00:00.000Z");
    const end = new Date("2026-09-07T10:00:00.000Z");
    const existingShift = { id: "old-assignment", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07",
      startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: role.id, shiftRole: verifiedRole,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, version: 1, breakMinutes: 0,
      assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Employee 001",
        employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
      publicNote: null, internalNote: null } as Shift;
    render(<ShiftDialog draft={{ date: "2026-09-07", start, end }} existingShift={existingShift} roles={[verifiedRole]}
      templates={[]} employees={[employee(1), { ...employee(2), positions: [{ id: "job-front", code: "front", name: "前场" }] }]}
      availability={[availableForEmployeeOne(), { ...availableForEmployeeOne(), id: "available-2", employeeId: "employee-2" }]}
      existingShifts={[existingShift]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Employee 001/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Employee 002/ })).toBeTruthy();
  });

  it("blocks saving a preselected employee whose formal Job does not match", () => {
    const onSave = vi.fn();
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00"), employeeId: "employee-1" }}
      roles={[{ ...role, formalJobId: "job-front" }]} templates={[]} employees={[employee(1)]}
      availability={[availableForEmployeeOne()]} existingShifts={[]} workforceGeneratedAt={null} saving={false}
      timezone="UTC" onClose={vi.fn()} onSave={onSave}
    />);
    fireEvent.click(screen.getByRole("radio", { name: "前场" }));
    expect(screen.getByRole("alert").textContent).toContain("Employee 001 未取得前场的正式岗位授权");
    expect((screen.getByRole("button", { name: /保存班次/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("exposes elapsed duration and both offsets before saving a fall-back drag selection", () => {
    render(<ShiftDialog
      draft={{ date: "2026-04-05", start: new Date("2026-04-04T15:00:00.000Z"), end: new Date("2026-04-04T17:00:00.000Z") }}
      roles={[role]} templates={[]} employees={[employee(1)]} existingShifts={[]} availability={[]}
      workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney" onClose={vi.fn()} onSave={vi.fn()}
    />);
    expect(screen.getByText(/实际经过 2 小时/).textContent).toContain("02:00 UTC+11–03:00 UTC+10");
    expect(screen.getByText(/跨越夏令时切换/)).toBeTruthy();
  });

  it("preserves the second repeated Sydney clock occurrence when saving an edited shift", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-04-04T15:30:00.000Z");
    const end = new Date("2026-04-04T16:30:00.000Z");
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog
      draft={{ date: "2026-04-05", start, end, employeeId: "employee-1" }}
      roles={[role]} templates={[]} employees={[employee(1)]} existingShifts={[]}
      availability={[{ id: "fallback-available", storeId: "store-1", employeeId: "employee-1", date: "2026-04-05", status: "AVAILABLE", startAt: "2026-04-04T14:00:00.000Z", endAt: "2026-04-04T18:00:00.000Z", note: null, source: "MANUAL", version: 1 }]}
      workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney" onClose={vi.fn()} onSave={onSave}
    />);
    expect(screen.getByText(/第二次 02:30/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "前场" }));
    fireEvent.change(screen.getByRole("textbox", { name: "公开备注" }), { target: { value: "DST note" } });
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z", publicNote: "DST note",
    }));
  });
  it("keeps the second occurrence choice when a copied shift targets another fall-back date", () => {
    const start = new Date("2026-04-04T15:30:00.000Z");
    const end = new Date("2026-04-04T16:30:00.000Z");
    const source = { id: "fallback-source", date: "2026-04-05", startAt: start.toISOString(), endAt: end.toISOString(),
      shiftRoleId: "front", breakMinutes: 0, assignments: [{ employeeId: "employee-1" }], publicNote: null, internalNote: null } as Shift;
    const props = { copySourceShift: source, roles: [role], templates: [], employees: [employee(1)], availability: [],
      existingShifts: [], workforceGeneratedAt: null, saving: false, timezone: "Australia/Sydney", onClose: vi.fn(), onSave: vi.fn() };
    const { rerender } = render(<ShiftDialog {...props} draft={{ date: "2026-04-05", start, end }} />);
    rerender(<ShiftDialog {...props} draft={{ date: "2027-04-04", start, end }} />);
    expect(screen.getByText(/第二次 02:30/)).toBeTruthy();
  });

  it("rechecks the target's repeated-hour Availability before copying a Shift", async () => {
    const user = userEvent.setup();
    const start = new Date("2026-04-04T16:15:00.000Z");
    const end = new Date("2026-04-04T16:45:00.000Z");
    const source = { id: "fallback-source", date: "2026-04-05", startAt: start.toISOString(), endAt: end.toISOString(),
      shiftRoleId: "front", breakMinutes: 0, assignments: [{ employeeId: "employee-1" }], publicNote: null, internalNote: null } as Shift;
    const firstWindow = { id: "first-window", storeId: "store-1", employeeId: "employee-1", date: "2027-04-04", status: "AVAILABLE" as const,
      startAt: "2027-04-03T15:15:00.000Z", endAt: "2027-04-03T15:45:00.000Z", note: null, source: "MANUAL" as const, version: 1 };
    const secondWindow = { ...firstWindow, id: "second-window", startAt: "2027-04-03T16:15:00.000Z", endAt: "2027-04-03T16:45:00.000Z" };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const props = { copySourceShift: source, roles: [role], templates: [], employees: [employee(1)], existingShifts: [],
      workforceGeneratedAt: null, saving: false, timezone: "Australia/Sydney", onClose: vi.fn(), onSave };
    const draft = { date: "2027-04-04", start, end };
    const { rerender } = render(<ShiftDialog {...props} draft={draft} availability={[firstWindow]} />);
    expect(screen.getByText(/第二次 02:15/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(screen.getByRole("alert").textContent).toContain("没有完整的可用时间");
    expect(onSave).not.toHaveBeenCalled();

    rerender(<ShiftDialog {...props} draft={draft} availability={[secondWindow]} />);
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      date: "2027-04-04", startAt: secondWindow.startAt, endAt: secondWindow.endAt,
    }));
  });

  it("shows a preselected employee beyond the first picker page at the top", () => {
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00"), employeeId: "employee-499" }}
      roles={[role]}
      templates={[]}
      employees={Array.from({ length: 500 }, (_, index) => employee(index))}
      availability={[]}
      existingShifts={[]}
      workforceGeneratedAt={null}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);
    const rows = within(screen.getByLabelText("员工列表")).getAllByRole("button");
    expect(rows).toHaveLength(60);
    expect(rows[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(rows[0]?.textContent).toContain("Target Employee");
  });

  it("keeps a newly selected available employee in place while choosing more staff", async () => {
    const user = userEvent.setup();
    const availability = [1, 2, 3].map((index) => ({ ...availableForEmployeeOne(),
      id: `available-${index}`, employeeId: `employee-${index}` }));
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00.000Z"), end: new Date("2026-09-07T10:00:00.000Z") }}
      roles={[role]} templates={[]} employees={[employee(1), employee(2), employee(3)]}
      availability={availability} existingShifts={[]} workforceGeneratedAt={null} saving={false} timezone="UTC"
      onClose={vi.fn()} onSave={vi.fn()}
    />);
    await user.click(screen.getByRole("radio", { name: "前场" }));
    const names = () => within(screen.getByLabelText("员工列表")).getAllByRole("button")
      .map((button) => button.textContent?.match(/Employee \d{3}/)?.[0]);
    expect(names()).toEqual(["Employee 001", "Employee 002", "Employee 003"]);
    await user.click(screen.getByRole("button", { name: /Employee 003/ }));
    expect(names()).toEqual(["Employee 001", "Employee 002", "Employee 003"]);
    expect(screen.getByRole("button", { name: /Employee 003/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a bounded first page for 500 employees and finds a later employee by search", async () => {
    const user = userEvent.setup();
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role]}
      templates={[]}
      employees={Array.from({ length: 500 }, (_, index) => employee(index))}
      availability={[]}
      existingShifts={[]}
      workforceGeneratedAt="2026-09-07T00:00:00Z"
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);

    expect(within(screen.getByLabelText("员工列表")).getAllByRole("button")).toHaveLength(60);
    expect(screen.getByRole("button", { name: /加载更多/ })).toBeTruthy();

    await user.type(screen.getByPlaceholderText("搜索员工姓名"), "Target Employee");
    expect(within(screen.getByLabelText("员工列表")).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Target Employee.*T2 82.4 分/ })).toBeTruthy();
  });

  it("submits the selected employee with the official role and time", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role]}
      templates={[]}
      employees={[employee(1)]}
      availability={[availableForEmployeeOne()]}
      existingShifts={[]}
      workforceGeneratedAt={null}
      saving={false}
      onClose={vi.fn()}
      onSave={onSave}
    />);

    await user.click(screen.getByRole("radio", { name: "前场" }));
    await user.click(screen.getByRole("button", { name: /Employee 001/ }));
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      date: "2026-09-07",
      breakMinutes: 0,
      shiftRoleId: "front",
      employeeIds: ["employee-1"],
    });
  });

  it("commits input events from native time fields before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00.000Z"), end: new Date("2026-09-07T12:00:00.000Z"), employeeId: "employee-1" }}
      roles={[role]} templates={[]} employees={[employee(1)]} availability={[availableForEmployeeOne()]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} timezone="UTC" onClose={vi.fn()} onSave={onSave}
    />);
    fireEvent.input(screen.getByLabelText("开始时间"), { target: { value: "10:00" } });
    fireEvent.input(screen.getByLabelText("结束时间"), { target: { value: "13:00" } });
    expect(screen.getByText(/10:00 - 13:00/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "前场" }));
    await user.click(screen.getByRole("button", { name: /保存班次/ }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ startAt: "2026-09-07T10:00:00.000Z", endAt: "2026-09-07T13:00:00.000Z" });
  });

  it("sets and clears next-day ending when switching overnight and daytime templates", () => {
    const template = { id: "overnight", storeId: "store-1", name: "夜班", startTime: "22:00", endTime: "02:00", breakMinutes: 0,
      shiftRoleId: "front", isActive: true, displayOrder: 0, version: 1, shiftRole: role };
    const daytime = { ...template, id: "daytime", name: "早班", startTime: "09:00", endTime: "17:00" };
    const roleFree = { ...template, id: "no-role", name: "仅时间", shiftRoleId: null, shiftRole: null };
    render(<ShiftDialog
      draft={{ date: "2026-10-09", start: new Date("2026-10-08T22:00:00.000Z"), end: new Date("2026-10-08T23:00:00.000Z") }}
      roles={[role]} templates={[template, daytime, roleFree]} employees={[employee(1)]} availability={[]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} timezone="Australia/Sydney" onClose={vi.fn()} onSave={vi.fn()}
    />);
    const nextDay = screen.getByRole("checkbox", { name: "次日结束" }) as HTMLInputElement;
    const job = screen.getByRole("radio", { name: "前场" }) as HTMLInputElement;
    expect(job.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "保存班次" }));
    expect(screen.getByRole("alert").textContent).toContain("请选择班次岗位");
    fireEvent.change(screen.getByRole("combobox", { name: "套用预设班次" }), { target: { value: "no-role" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(job.checked).toBe(false);
    fireEvent.change(screen.getByRole("combobox", { name: "套用预设班次" }), { target: { value: "overnight" } });
    expect(nextDay.checked).toBe(true);
    expect(job.checked).toBe(true);
    expect(screen.getByText(/22:00 - 02:00（次日）/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "套用预设班次" }), { target: { value: "daytime" } });
    expect(nextDay.checked).toBe(false);
    expect(screen.getByText(/09:00 - 17:00/)).toBeTruthy();
  });

  it("shows roles as a clear single-select chip group and submits the changed role", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role, barRole]}
      templates={[]}
      employees={[employee(1)]}
      availability={[availableForEmployeeOne()]}
      existingShifts={[]}
      workforceGeneratedAt={null}
      saving={false}
      onClose={vi.fn()}
      onSave={onSave}
    />);

    expect((screen.getByRole("radio", { name: "前场" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("radio", { name: "水吧" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "水吧" }));
    expect((screen.getByRole("radio", { name: "水吧" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: /Employee 001/ }));
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ shiftRoleId: "bar" });
  });

  it("filters by shift skill requirements without claiming formal position qualification", async () => {
    const user = userEvent.setup();
    const kitchenEmployee = employee(2);
    kitchenEmployee.skillSummary = {
      ...kitchenEmployee.skillSummary,
      qualifiedSkillCodes: ["steeping"],
    };
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role, kitchenRole]}
      templates={[]}
      employees={[employee(1), kitchenEmployee]}
      availability={[]}
      existingShifts={[]}
      workforceGeneratedAt={null}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);

    expect(screen.getByText("显示 2 / 2 人")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "后场" }));
    expect(screen.getByText("显示 1 / 2 人")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Employee 002/ })).toBeTruthy();
    expect(screen.getByText("岗位未确认")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "前场" }) as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "前场" }));
    expect(screen.getByText("显示 2 / 2 人")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "全部员工" }));
    expect((screen.getByRole("checkbox", { name: "前场" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "后场" }) as HTMLInputElement).checked).toBe(false);
  });

  it("does not let a manager select an employee without available time", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ShiftDialog
      draft={{ date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00") }}
      roles={[role]} templates={[]} employees={[employee(1)]} availability={[]} existingShifts={[]}
      workforceGeneratedAt={null} saving={false} onClose={vi.fn()} onSave={onSave}
    />);
    const candidate = screen.getByRole("button", { name: /Employee 001/ });
    expect((candidate as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "保存班次" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a next-day end timestamp only when both dates cover the shift", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const draft = { date: "2026-09-07", start: new Date("2026-09-07T23:00:00"), end: new Date("2026-09-07T02:00:00") };
    const availability = [
      { ...availableForEmployeeOne(), startAt: "2026-09-07T00:00:00.000Z", endAt: "2026-09-08T00:00:00.000Z" },
      { ...availableForEmployeeOne(), id: "available-2", date: "2026-09-08", startAt: "2026-09-08T00:00:00.000Z", endAt: "2026-09-09T00:00:00.000Z" },
    ];
    render(<ShiftDialog draft={draft} roles={[role]} templates={[]} employees={[employee(1)]} availability={availability} existingShifts={[]} workforceGeneratedAt={null} saving={false} onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("checkbox", { name: "次日结束" }));
    await user.click(screen.getByRole("radio", { name: "前场" }));
    await user.click(screen.getByRole("button", { name: /Employee 001/ }));
    await user.click(screen.getByRole("button", { name: "保存班次（1人）" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(new Date(onSave.mock.calls[0]?.[0].endAt).getTime() - new Date(onSave.mock.calls[0]?.[0].startAt).getTime()).toBe(3 * 3_600_000);
  });
  it("retains unsaved input and blocks writes while the calendar snapshot is unavailable", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const props = {
      draft: { date: "2026-09-07", start: new Date("2026-09-07T09:00:00"), end: new Date("2026-09-07T10:00:00"), employeeId: "employee-1" },
      roles: [role], templates: [], employees: [employee(1)], availability: [availableForEmployeeOne()], existingShifts: [],
      workforceGeneratedAt: null, saving: false, onClose: vi.fn(), onSave,
    };
    const { rerender } = render(<ShiftDialog {...props} />);
    await user.type(screen.getByRole("textbox", { name: "公开备注" }), "Keep this note");
    const retryContext = vi.fn();
    rerender(<ShiftDialog {...props} snapshotUnavailable onRetryContext={retryContext} />);
    expect((screen.getByRole("textbox", { name: "公开备注" }) as HTMLTextAreaElement).value).toBe("Keep this note");
    expect((screen.getByRole("button", { name: /保存班次/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/排班数据暂时无法确认/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重试员工与可用时间" }));
    expect(retryContext).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    rerender(<ShiftDialog {...props} snapshotUnavailable={false} />);
    expect((screen.getByRole("textbox", { name: "公开备注" }) as HTMLTextAreaElement).value).toBe("Keep this note");
    expect((screen.getByRole("button", { name: /保存班次/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps copy inputs and blocks a nonexistent Sydney spring-forward clock after changing the target date", () => {
    const start = new Date("2026-10-02T16:30:00.000Z");
    const end = new Date("2026-10-02T17:30:00.000Z");
    const copySourceShift = {
      id: "source", date: "2026-10-03", startAt: start.toISOString(), endAt: end.toISOString(), shiftRoleId: "front",
      breakMinutes: 0, assignments: [{ employeeId: "employee-1" }], publicNote: "Source note", internalNote: "",
    } as Shift;
    const onSave = vi.fn();
    const props = {
      copySourceShift, roles: [role], templates: [], employees: [employee(1)], availability: [], existingShifts: [],
      workforceGeneratedAt: null, saving: false, timezone: "Australia/Sydney", onClose: vi.fn(), onSave,
    };
    const { rerender } = render(<ShiftDialog {...props} draft={{ date: "2026-10-03", start, end }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "公开备注" }), { target: { value: "Keep this edit" } });
    rerender(<ShiftDialog {...props} draft={{ date: "2026-10-04", start, end }} snapshotUnavailable snapshotUnavailableReason="正在确认目标日期的员工可用时间，请稍候。" />);
    expect((screen.getByRole("textbox", { name: "公开备注" }) as HTMLTextAreaElement).value).toBe("Keep this edit");
    expect(screen.getByText(/2026-10-04 02:30 在门店时区不存在/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /保存班次/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ShiftDialog {...props} draft={{ date: "2026-10-04", start, end }} />);
    expect((screen.getByRole("button", { name: /保存班次/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });
});

function availableForEmployeeOne() {
  return { id: "available-1", employeeId: "employee-1", storeId: "store-1", date: "2026-09-07", status: "AVAILABLE" as const, startAt: "2026-09-06T00:00:00.000Z", endAt: "2026-09-08T00:00:00.000Z", note: null, source: "MANUAL" as const, version: 1 };
}
