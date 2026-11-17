import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { rosterRepository } from "../../services/rosterRepository";
import type { CalendarResponse, ShiftRole } from "../../types/roster";
import { CalendarScheduledSidebar } from "./CalendarScheduledSidebar";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const role: ShiftRole = { id: "role-a", storeId: "store-a", code: "front", nameZh: "前场",
  colorToken: "#334155", requiredSkillCodes: [], formalJobId: "job-a" };
const firstCalendar: CalendarResponse = {
  storeId: "store-a", from: "2026-10-26", to: "2026-12-06",
  periods: [{ id: "period-a", storeId: "store-a", startDate: "2026-10-26", endDate: "2026-11-01",
    cycleType: "WEEK", status: "DRAFT", version: 1, publishedAt: null }],
  shifts: [{ id: "shift-a", rosterPeriodId: "period-a", storeId: "store-a", date: "2026-10-27",
    startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T06:00:00.000Z", breakMinutes: 0,
    shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
    publicNote: null, internalNote: null, version: 1, shiftRole: role,
    assignments: [{ id: "assignment-a", employeeId: "employee-a", employeeNameSnapshot: "Alice",
      employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }] }],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("resets selected dates and filters on store change and ignores the old store response", async () => {
  const oldRequest = deferred<CalendarResponse>();
  const newRequest = deferred<CalendarResponse>();
  let oldCalls = 0;
  vi.spyOn(rosterRepository, "calendar").mockImplementation(async (storeId) => {
    if (storeId === "store-a") return ++oldCalls === 1 ? firstCalendar : oldRequest.promise;
    return newRequest.promise;
  });
  const base = { weekStartsOn: 1, timezone: "Australia/Sydney", currentEmployeeNames: new Map([["employee-a", "Alice"]]),
    employees: [], jobs: [], verifiedRoles: [role], onClose: vi.fn() };
  const view = render(<CalendarScheduledSidebar {...base} storeId="store-a" initialDate="2026-10-27" refreshKey={null} />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getByRole("button", { name: "2026-10-28" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索员工姓名" }), { target: { value: "Alice" } });
  view.rerender(<CalendarScheduledSidebar {...base} storeId="store-a" initialDate="2026-10-27" refreshKey={firstCalendar} />);
  await waitFor(() => expect(oldCalls).toBe(2));

  view.rerender(<CalendarScheduledSidebar {...base} storeId="store-b" initialDate="2026-11-03" refreshKey={null} />);
  expect((screen.getByRole("searchbox", { name: "搜索员工姓名" }) as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("button", { name: "2026-11-03" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "2026-10-27" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByText("Alice")).toBeNull();

  oldRequest.resolve(firstCalendar);
  newRequest.resolve({ storeId: "store-b", from: "2026-10-26", to: "2026-12-06", periods: [], shifts: [] });
  await screen.findByText("所选日期没有匹配的员工班次。");
  expect(screen.queryByText("Alice")).toBeNull();
});
