import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { PayrollPanel } from "./PayrollPanel";
const api = vi.hoisted(() => vi.fn());
vi.mock("../../lib/apiClient", () => ({ apiRequest: api }));
vi.mock("../ui/AppSelect", () => ({
  AppSelect: ({
    label,
    ariaLabel,
    value,
    onValueChange,
    options,
    disabled,
  }: {
    label?: string;
    ariaLabel?: string;
    value: string;
    onValueChange: (s: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));
const employee = "00000000-0000-4000-8000-000000000002",
  rate = "00000000-0000-4000-8000-000000000005";
const connection = {
  configured: true,
  connected: true,
  tenantId: "tenant-a",
  organizationName: "Demo AU",
  organizations: [],
  lastConnectionTime: "2026-11-17",
  lastSuccessfulSync: null,
};
const refs = {
  employees: [
    {
      EmployeeID: employee,
      FirstName: "Alice",
      LastName: "Test",
      PayrollCalendarID: "cal",
    },
  ],
  rates: [
    {
      EarningsRateID: rate,
      Name: "Ordinary",
      RateType: "RATEPERUNIT",
      TypeOfUnits: "Hours",
    },
  ],
  calendars: [{ PayrollCalendarID: "cal", Name: "Weekly" }],
  tracking: [],
};
const maps = {
  tenantId: "tenant-a",
  _version: 1,
  employees: { "roster-a": { xeroEmployeeId: employee, status: "Matched" } },
  rates: { Ordinary: rate },
  tracking: {},
};
const preview = {
  id: "preview-1",
  _version: 1,
  status: "Draft",
  organizationName: "Demo AU",
  tenantId: "tenant-a",
  rows: [
    {
      id: "row-1",
      employeeId: "roster-a",
      employeeName: "Alice",
      storeId: "hurstville",
      date: "2026-11-16",
      startAt: "2026-11-15T23:00:00Z",
      endAt: "2026-11-16T06:00:00Z",
      timezone: "Australia/Sydney",
      scheduledMinutes: 360,
      unpaidBreakMinutes: 60,
      paidMinutes: 360,
      category: "Ordinary",
      confirmed: true,
      reason: "核对实际工时",
    },
  ],
};
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/status")) return structuredClone(connection);
    if (path.endsWith("/references")) return structuredClone(refs);
    if (path.endsWith("/mappings")) return structuredClone(maps);
    if (path.endsWith("/previews")) return structuredClone(preview);
    if (path.endsWith("/previews/preview-1") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      return {
        ...structuredClone(preview),
        _version: 2,
        rows: body.rows.map((r: object) => ({ ...preview.rows[0], ...r })),
      };
    }
    if (path.endsWith("/validate"))
      return { groups: [], errors: [], remote: [], totalPaidHours: 6 };
    throw Error("Unexpected " + path);
  });
});
afterEach(cleanup);
it("unsaved actual hours invalidate confirmation and disable server validation until saved", async () => {
  render(
    <PayrollPanel
      selection={{ storeId: "hurstville", periodId: "week1" }}
      stores={[{ id: "hurstville", name: "Hurstville" }]}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Sync to Xero · 预览工时" }),
  );
  await screen.findByText("Payroll Preview · Demo AU");
  const validate = screen.getByRole("button", {
    name: "校验 Payroll Period 与 Xero",
  });
  expect(validate).toHaveProperty("disabled", false);
  fireEvent.change(screen.getByLabelText("Alice 2026-11-16 实际分钟"), {
    target: { value: "420" },
  });
  expect(validate).toHaveProperty("disabled", true);
  expect(screen.getByRole("checkbox", { name: "确认实际工时" })).toHaveProperty(
    "checked",
    false,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "确认实际工时" }));
  fireEvent.click(screen.getByRole("button", { name: "保存工时确认 / 调整" }));
  await waitFor(() => expect(validate).toHaveProperty("disabled", false));
  expect(api.mock.calls.some(([p]) => p.endsWith("/confirm"))).toBe(false);
});
it("unsaved employee mapping blocks validation rather than confirming the old mapping", async () => {
  render(
    <PayrollPanel
      selection={{ storeId: "hurstville", periodId: "week1" }}
      stores={[]}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Sync to Xero · 预览工时" }),
  );
  await screen.findByText("Payroll Preview · Demo AU");
  fireEvent.change(screen.getByRole("combobox", { name: "Alice · Matched" }), {
    target: { value: "none" },
  });
  expect(
    screen.getByRole("button", { name: "校验 Payroll Period 与 Xero" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByRole("button", { name: "确认并锁定实际工时" }),
  ).toHaveProperty("disabled", true);
});
it("an unconfigured Xero app does not invent a mock connection", async () => {
  api.mockResolvedValue({
    configured: false,
    connected: false,
    organizations: [],
  });
  render(<PayrollPanel selection={null} stores={[]} />);
  expect(await screen.findByText("服务端尚未配置 Xero App")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Connect to Xero/ }),
  ).toHaveProperty("disabled", true);
  expect(screen.queryByText(/Payroll Preview/)).toBeNull();
});
